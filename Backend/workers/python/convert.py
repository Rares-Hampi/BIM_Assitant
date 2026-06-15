#!/usr/bin/env python3
"""
BIM Assistant - IFC Conversion Worker
RabbitMQ consumer that converts IFC files to GLB format
"""

import sys
import os
import json
import subprocess
import time
import tempfile
import traceback
from datetime import datetime

import pika
import psycopg2
import ifcopenshell
from minio import Minio
from minio.error import S3Error

# ============================================================================
# CONFIGURATION
# ============================================================================

# RabbitMQ Configuration
RABBITMQ_URL = os.getenv('RABBITMQ_URL', 'amqp://admin:rabbitmq_password@rabbitmq:5672')
RABBITMQ_QUEUE = os.getenv('RABBITMQ_QUEUE', 'bim.conversion')

# Database Configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'postgres'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'bim_assistant'),
    'user': os.getenv('DB_USER', 'bim_user'),
    'password': os.getenv('DB_PASSWORD', 'bim_password')
}

# MinIO Configuration
MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT', 'minio:9000')
MINIO_ACCESS_KEY = os.getenv('MINIO_ACCESS_KEY', 'minioadmin')
MINIO_SECRET_KEY = os.getenv('MINIO_SECRET_KEY', 'minioadmin123')
MINIO_USE_SSL = os.getenv('MINIO_USE_SSL', 'false').lower() == 'true'
MINIO_BUCKET = os.getenv('MINIO_BUCKET', 'bim-converted-models')

# IFC Conversion
IFC_CONVERT_BIN = "/usr/local/bin/IfcConvert"

# Classification Logic
KEYWORDS = {
    # MEP Categories
    "ducts": ["duct", "grille", "diffuser", "exhaust", "supply", "return", "damper", "fcu", "fan", "air terminal", "hvac"],
    "pipes": ["pipe", "water", "sanitary", "sewer", "drain", "waste", "valve", "faucet", "sink", "sprinkler", "pump", "plumbing"],
    "electrical": ["cable", "tray", "wire", "conduit", "switch", "socket", "panel", "lighting", "detector", "fixture", "light"],
    
    # Structural/Architectural Categories
    "walls": ["wall", "curtain", "cladding", "partition"],
    "slabs": ["slab", "floor", "roof", "footing", "deck"],
    "doors": ["door", "entrance", "exit", "gate"],
    "windows": ["window", "glazing", "skylight"],
    "columns": ["column", "pillar", "post"],
    "beams": ["beam", "joist", "rafter", "purlin"],
    "stairs": ["stair", "railing", "handrail", "ramp"],
    
    # Other Categories
    "furniture": ["furniture", "desk", "chair", "table", "cabinet"],
    "equipment": ["equipment", "appliance", "fixture"]
}

STRUCTURAL_CLASSES = {
    "walls": ["IfcWall", "IfcWallStandardCase", "IfcCurtainWall"],
    "slabs": ["IfcSlab", "IfcRoof", "IfcFooting", "IfcCovering"],
    "doors": ["IfcDoor"],
    "windows": ["IfcWindow"],
    "columns": ["IfcColumn"],
    "beams": ["IfcBeam"],
    "stairs": ["IfcStair", "IfcStairFlight", "IfcRailing", "IfcRamp"],
    "furniture": ["IfcFurnishingElement", "IfcFurniture"],
    "equipment": ["IfcBuildingElementProxy", "IfcFlowTerminal"]
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_db_connection():
    """Create database connection"""
    return psycopg2.connect(**DB_CONFIG)

def get_minio_client():
    """Create MinIO client"""
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_USE_SSL
    )

def update_file_status(file_id, status, progress=None, message=None, error=None):
    """Update file status in database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        update_parts = ["status = %s", "updated_at = NOW()"]
        values = [status]
        
        if progress is not None:
            update_parts.append("progress = %s")
            values.append(progress)
        
        if message is not None:
            update_parts.append("status_message = %s")
            values.append(message)
        
        if error is not None:
            update_parts.append("error_message = %s")
            values.append(error)
        
        values.append(file_id)
        
        query = f"UPDATE bim_files SET {', '.join(update_parts)} WHERE id = %s"
        cursor.execute(query, values)
        conn.commit()
        
        cursor.close()
        conn.close()
        
        print(f"Updated file {file_id}: {status} ({progress}%) - {message}")
        
    except Exception as e:
        print(f"Error updating database: {e}")

def get_category(element):
    """Classify IFC element into category"""
    name = (element.Name or "").lower()
    obj_type = (element.ObjectType or "").lower()
    full_text = f"{name} {obj_type}"
    entity_type = element.is_a()

    # Check keywords first
    for cat, words in KEYWORDS.items():
        for word in words:
            if word in full_text:
                return cat

    # Check IFC classes
    for cat, classes in STRUCTURAL_CLASSES.items():
        if entity_type in classes:
            return cat
            
    return "others"

# ============================================================================
# CONVERSION LOGIC
# ============================================================================

def process_conversion_job(job_data):
    """
    Process IFC conversion job
    
    Job data structure:
    {
        "jobId": "file-uuid",
        "fileId": "file-uuid",
        "projectId": "project-uuid",
        "userId": "user-uuid",
        "tempPath": "/app/uploads/temp/filename.ifc",
        "originalName": "building.ifc"
    }
    """
    file_id = job_data.get('fileId')
    project_id = job_data.get('projectId')
    temp_path = job_data.get('tempPath')
    original_name = job_data.get('originalName', 'unknown.ifc')
    
    print(f"\n{'='*60}")
    print(f"Processing Conversion Job")
    print(f"{'='*60}")
    print(f"File ID: {file_id}")
    print(f"Project ID: {project_id}")
    print(f"Original: {original_name}")
    print(f"Temp Path: {temp_path}")
    print(f"{'='*60}\n")
    
    temp_dir = None
    
    try:
        # Update status: processing
        update_file_status(file_id, 'processing', 0, 'Starting conversion...')
        
        # Create temporary directory
        temp_dir = tempfile.mkdtemp(prefix='ifc_conversion_')
        print(f"Created temp directory: {temp_dir}")
        
        # Check if temp file exists
        if not os.path.exists(temp_path):
            raise FileNotFoundError(f"Temp file not found: {temp_path}")
        
        local_ifc_path = os.path.join(temp_dir, 'input.ifc')
        
        # Copy from temp location
        import shutil
        shutil.copy(temp_path, local_ifc_path)
        print(f"Copied IFC file to: {local_ifc_path}")
        
        update_file_status(file_id, 'processing', 10, 'Analyzing IFC structure...')
        
        # ===== STEP 1: Analyze IFC and categorize elements =====
        print(f"\n[1/5] Analyzing IFC structure...")
        model = ifcopenshell.open(local_ifc_path)
        
        # Create buckets for all categories + "others" as fallback
        buckets = {key: [] for key in list(KEYWORDS.keys()) + ["others"]}
        metadata_export = {key: {} for key in buckets.keys()}
        
        products = model.by_type("IfcProduct")
        print(f"Found {len(products)} IFC products")
        
        for product in products:
            if product.is_a("IfcSpatialStructureElement") or product.is_a("IfcOpeningElement"):
                continue
                
            cat = get_category(product)
            buckets[cat].append(product.GlobalId)
            
            # Extract comprehensive metadata
            element_data = {
                "GlobalId": product.GlobalId,
                "Name": product.Name or "",
                "IfcType": product.is_a(),
                "Category": cat,
                "Description": getattr(product, 'Description', None) or "",
                "Tag": getattr(product, 'Tag', None) or "",
                "ObjectType": getattr(product, 'ObjectType', None) or ""
            }
            
            # Extract properties from property sets
            try:
                if hasattr(product, 'IsDefinedBy'):
                    properties = {}
                    for definition in product.IsDefinedBy:
                        if definition.is_a('IfcRelDefinesByProperties'):
                            property_set = definition.RelatingPropertyDefinition
                            if property_set.is_a('IfcPropertySet'):
                                for prop in property_set.HasProperties:
                                    if prop.is_a('IfcPropertySingleValue'):
                                        prop_name = prop.Name
                                        if prop.NominalValue:
                                            prop_value = prop.NominalValue.wrappedValue
                                            properties[prop_name] = str(prop_value)
                    
                    if properties:
                        element_data["Properties"] = properties
            except Exception as e:
                pass  # Skip if property extraction fails
            
            # Extract material
            try:
                if hasattr(product, 'HasAssociations'):
                    for association in product.HasAssociations:
                        if association.is_a('IfcRelAssociatesMaterial'):
                            material = association.RelatingMaterial
                            if material.is_a('IfcMaterial'):
                                element_data["Material"] = material.Name
                            elif material.is_a('IfcMaterialLayerSetUsage'):
                                layer_set = material.ForLayerSet
                                if layer_set:
                                    materials = [layer.Material.Name for layer in layer_set.MaterialLayers if layer.Material]
                                    element_data["Material"] = ", ".join(materials)
            except Exception as e:
                pass
            
            # Extract spatial location (Level/Storey)
            try:
                if hasattr(product, 'ContainedInStructure'):
                    for rel in product.ContainedInStructure:
                        structure = rel.RelatingStructure
                        if structure.is_a('IfcBuildingStorey'):
                            element_data["Level"] = structure.Name or structure.LongName or ""
                            break
            except Exception as e:
                pass
            
            metadata_export[cat][product.GlobalId] = element_data
        
        # Print category summary
        print(f"\nCategory Summary:")
        for cat, guids in buckets.items():
            if guids:
                print(f"   {cat}: {len(guids)} elements")
        
        model = None  # Free memory
        
        update_file_status(file_id, 'processing', 25, 'Converting models...')
        
        # ===== STEP 2: Convert each category to GLB =====
        print(f"\n[2/5] Converting categories to GLB...")
        
        minio_client = get_minio_client()
        converted_files = []
        total_categories = sum(1 for guids in buckets.values() if guids)
        current_category = 0
        
        for cat, guids in buckets.items():
            if not guids:
                continue
            
            current_category += 1
            progress = 25 + int((current_category / total_categories) * 50)
            
            print(f"\n--- Processing {cat} ({len(guids)} items) ---")
            update_file_status(file_id, 'processing', progress, f'Converting {cat}...')
            
            # Save JSON metadata
            json_path = os.path.join(temp_dir, f"{cat}.json")
            with open(json_path, "w") as f:
                json.dump(metadata_export[cat], f, indent=2)
            
            # Upload JSON to MinIO
            json_minio_path = f"{project_id}/{file_id}/{cat}.json"
            minio_client.fput_object(MINIO_BUCKET, json_minio_path, json_path)
            print(f"   Uploaded {cat}.json to MinIO")
            
            # Create temporary IFC with only this category
            temp_model = ifcopenshell.open(local_ifc_path)
            all_elements = temp_model.by_type("IfcElement")
            guid_set = set(guids)
            
            for ele in all_elements:
                if ele.GlobalId not in guid_set:
                    try:
                        temp_model.remove(ele)
                    except:
                        pass
            
            temp_ifc_path = os.path.join(temp_dir, f"temp_{cat}.ifc")
            temp_model.write(temp_ifc_path)
            print(f"   Created filtered IFC")
            
            # Convert to GLB
            output_glb = os.path.join(temp_dir, f"{cat}.glb")
            
            cmd = [
                IFC_CONVERT_BIN,
                temp_ifc_path,
                output_glb,
                "--y-up",
                "--verbose"
            ]
            
            try:
                result = subprocess.run(cmd, check=True, capture_output=True, text=True)
                print(f"   Converted to GLB")
                
                # Upload GLB to MinIO
                glb_minio_path = f"{project_id}/{file_id}/{cat}.glb"
                minio_client.fput_object(MINIO_BUCKET, glb_minio_path, output_glb)
                print(f"   Uploaded {cat}.glb to MinIO")
                
                converted_files.append({
                    'category': cat,
                    'glb_path': glb_minio_path,
                    'json_path': json_minio_path,
                    'element_count': len(guids)
                })
                
            except subprocess.CalledProcessError as e:
                print(f"   ERROR: IfcConvert failed for {cat}: {e.stderr}")
            
            # Cleanup temp IFC
            if os.path.exists(temp_ifc_path):
                os.remove(temp_ifc_path)
        
        # ===== STEP 3: Update database with results =====
        print(f"\n[3/5] Updating database...")
        update_file_status(file_id, 'processing', 85, 'Finalizing...')
        
        # Store converted paths in database
        conn = get_db_connection()
        cursor = conn.cursor()
        
        converted_path_json = json.dumps(converted_files)
        metadata_path = f"{project_id}/{file_id}/metadata.json"
        
        cursor.execute("""
            UPDATE bim_files 
            SET 
                converted_path = %s,
                metadata_path = %s,
                status = 'completed',
                progress = 100,
                status_message = 'Conversion completed successfully',
                error_message = NULL,
                updated_at = NOW()
            WHERE id = %s
        """, (converted_path_json, metadata_path, file_id))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"Database updated successfully")
        
        # ===== STEP 4: Cleanup temp files =====
        print(f"\n[4/5] Cleaning up...")
        
        # Delete original temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)
            print(f"Deleted temp file: {temp_path}")
        
        update_file_status(file_id, 'completed', 100, 'Conversion completed successfully')
        
        print(f"\n{'='*60}")
        print(f"CONVERSION COMPLETED SUCCESSFULLY")
        print(f"{'='*60}")
        print(f"Total categories converted: {len(converted_files)}")
        print(f"Total elements: {sum(f['element_count'] for f in converted_files)}")
        print(f"{'='*60}\n")
        
    except Exception as e:
        error_msg = f"Conversion failed: {str(e)}"
        print(f"\nERROR: {error_msg}")
        print(traceback.format_exc())
        
        update_file_status(file_id, 'failed', None, None, error_msg)
        
    finally:
        # Cleanup temp directory
        if temp_dir and os.path.exists(temp_dir):
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
            print(f"Cleaned up temp directory")

# ============================================================================
# RABBITMQ CONSUMER
# ============================================================================

def callback(ch, method, properties, body):
    """RabbitMQ message callback"""
    try:
        job_data = json.loads(body)
        print(f"\nReceived job: {job_data.get('jobId', 'unknown')}")
        
        process_conversion_job(job_data)
        
        # Acknowledge message
        ch.basic_ack(delivery_tag=method.delivery_tag)
        print(f"Job acknowledged\n")
        
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in message: {e}")
        ch.basic_ack(delivery_tag=method.delivery_tag)  # Acknowledge to remove bad message
        
    except Exception as e:
        print(f"ERROR: Error processing job: {e}")
        print(traceback.format_exc())
        # Reject and requeue (will retry)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

def start_consumer():
    """Start RabbitMQ consumer"""
    print(f"\n{'='*60}")
    print(f"BIM Assistant - IFC Conversion Worker")
    print(f"{'='*60}")
    print(f"RabbitMQ: {RABBITMQ_URL}")
    print(f"Queue: {RABBITMQ_QUEUE}")
    print(f"Database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
    print(f"MinIO: {MINIO_ENDPOINT}/{MINIO_BUCKET}")
    print(f"{'='*60}\n")
    
    while True:
        try:
            # Parse RabbitMQ URL
            params = pika.URLParameters(RABBITMQ_URL)
            params.heartbeat = 600
            params.blocked_connection_timeout = 300
            
            print("Connecting to RabbitMQ...")
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            
            # Declare queue (idempotent) with same arguments as backend
            channel.queue_declare(
                queue=RABBITMQ_QUEUE, 
                durable=True,
                arguments={'x-message-ttl': 86400000}  # 24 hours TTL (same as backend)
            )
            
            # Set QoS - only process 1 message at a time per worker
            channel.basic_qos(prefetch_count=1)
            
            print(f"Connected! Waiting for messages...")
            print(f"Press CTRL+C to exit\n")
            
            # Start consuming
            channel.basic_consume(
                queue=RABBITMQ_QUEUE,
                on_message_callback=callback,
                auto_ack=False
            )
            
            channel.start_consuming()
            
        except pika.exceptions.AMQPConnectionError as e:
            print(f"RabbitMQ connection error: {e}")
            print("Retrying in 5 seconds...")
            time.sleep(5)
            
        except KeyboardInterrupt:
            print("\n\nShutting down gracefully...")
            if 'channel' in locals() and channel.is_open:
                channel.stop_consuming()
            if 'connection' in locals() and connection.is_open:
                connection.close()
            print("Goodbye!")
            break
            
        except Exception as e:
            print(f"Unexpected error: {e}")
            print(traceback.format_exc())
            print("Retrying in 5 seconds...")
            time.sleep(5)

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    start_consumer()
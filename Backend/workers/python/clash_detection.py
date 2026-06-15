#!/usr/bin/env python3
"""
BIM Assistant - Clash Detection Worker
Performs geometric clash detection on converted GLB models
"""

import sys
import os
import json
import time
import pika
import psycopg2
import numpy as np
from datetime import datetime
from minio import Minio
from minio.error import S3Error
import trimesh

# ============================================================================
# CONFIGURATION
# ============================================================================

# RabbitMQ Configuration
RABBITMQ_URL = os.getenv('RABBITMQ_URL', 'amqp://admin:rabbitmq_password@rabbitmq:5672')
RABBITMQ_QUEUE = os.getenv('RABBITMQ_CLASH_QUEUE', 'bim.clash-detection')

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

# Clash Detection Settings
# Clearance distances in meters (e.g., 0.05 = 5cm)
CLEARANCE_RULES = {
    # MEP Systems
    'pipes': {
        'pipes': 0.05,      # 5cm between pipes
        'ducts': 0.10,      # 10cm between pipes and ducts
        'electrical': 0.05, # 5cm between pipes and electrical
        'walls': 0.0,       # Hard clash only
        'slabs': 0.0,       # Hard clash only
        'columns': 0.0,     # Hard clash only
        'beams': 0.0,       # Hard clash only
    },
    'ducts': {
        'ducts': 0.10,      # 10cm between ducts
        'electrical': 0.10, # 10cm between ducts and electrical
        'walls': 0.0,       # Hard clash only
        'slabs': 0.0,       # Hard clash only
        'columns': 0.0,     # Hard clash only
        'beams': 0.0,       # Hard clash only
    },
    'electrical': {
        'electrical': 0.05, # 5cm between electrical elements
        'walls': 0.0,       # Hard clash only
        'slabs': 0.0,       # Hard clash only
        'columns': 0.0,     # Hard clash only
        'beams': 0.0,       # Hard clash only
    },
    
    # Structural Elements (typically only hard clashes)
    'doors': {
        'windows': 0.10,    # 10cm between doors and windows
        'furniture': 0.50,  # 50cm clearance for door swing
        'equipment': 0.30,  # 30cm clearance
    },
    'windows': {
        'furniture': 0.20,  # 20cm clearance
    },
    'columns': {
        'doors': 0.0,       # Hard clash only
        'windows': 0.0,     # Hard clash only
        'stairs': 0.0,      # Hard clash only
    },
    'beams': {
        'doors': 0.0,       # Hard clash only
        'windows': 0.0,     # Hard clash only
    },
    'stairs': {
        'furniture': 0.80,  # 80cm clearance for circulation
        'equipment': 0.80,  # 80cm clearance
    },
    
    # Furniture & Equipment
    'furniture': {
        'furniture': 0.30,  # 30cm between furniture
    },
}

SEVERITY_THRESHOLDS = {
    'critical': 0.10,  # >10cm penetration
    'major': 0.05,     # 5-10cm penetration
    'minor': 0.01      # 1-5cm penetration
}

# Shape detection thresholds
BOX_ASPECT_RATIO_THRESHOLD = 0.1  # For box detection
CYLINDER_ASPECT_RATIO_THRESHOLD = 0.2

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def detect_primitive_type(mesh):
    """
    Detect if mesh is an analytic primitive (box, cylinder) or generic mesh
    Returns: 'box', 'cylinder', 'convex', 'complex'
    """
    try:
        # Check if mesh is convex
        is_convex = mesh.is_convex
        
        # Get extent of mesh and sort dimensions
        bounds = mesh.bounds
        extent = bounds[1] - bounds[0]
        sorted_extents = np.sort(extent)
        
        if is_convex:
            # Two smallest extents should be similar
            aspect_1 = sorted_extents[0] / sorted_extents[1]  # smallest / middle
            # Middle and largest should be very different (for cylinder)
            aspect_2 = sorted_extents[1] / sorted_extents[2]  # middle / largest
            
            # Cylinder: two dimensions similar (aspect_1 ≈ 1), one much larger (aspect_2 << 1)
            if aspect_1 > (1 - CYLINDER_ASPECT_RATIO_THRESHOLD) and aspect_2 < (1 - CYLINDER_ASPECT_RATIO_THRESHOLD):
                return 'cylinder'
            
            # Box: all three dimensions relatively balanced
            if (sorted_extents[0] / sorted_extents[2]) > (1 - BOX_ASPECT_RATIO_THRESHOLD):
                return 'box'
            
            return 'convex'
        else:
            return 'complex'
    except:
        return 'complex'

def sat_collision(mesh1, mesh2):
    """
    Separating Axis Theorem (SAT) collision detection for boxes/convex shapes
    Returns: (penetration_depth, contact_point, contact_normal)
    """
    try:
        # Use trimesh's built-in SAT-like collision detection
        collision_manager = trimesh.collision.CollisionManager()
        collision_manager.add_object('mesh1', mesh1)
        
        is_collision, contact_data = collision_manager.in_collision_single(
            mesh2, return_data=True
        )
        
        if not is_collision or not contact_data or len(contact_data) == 0:
            return 0.0, None, None
        
        contact = contact_data[0]
        depth = abs(contact.depth) if hasattr(contact, 'depth') else 0.0
        point = np.array(contact.point) if hasattr(contact, 'point') else None
        normal = np.array(contact.normal) if hasattr(contact, 'normal') else None
        
        return depth, point, normal
    except Exception as e:
        print(f"      SAT Error: {e}")
        return 0.0, None, None

def gjk_collision(mesh1, mesh2):
    """
    GJK (Gilbert-Johnson-Keerthi) collision detection for convex meshes
    Returns: (penetration_depth, contact_point, contact_normal)
    """
    try:
        # Use trimesh's collision detection (internally uses FCL which has GJK)
        collision_manager = trimesh.collision.CollisionManager()
        collision_manager.add_object('mesh1', mesh1)
        
        is_collision, contact_data = collision_manager.in_collision_single(
            mesh2, return_data=True
        )
        
        if not is_collision or not contact_data or len(contact_data) == 0:
            return 0.0, None, None
        
        # Get contact with deepest penetration
        max_contact = None
        max_depth = 0.0
        
        for contact in contact_data:
            depth = abs(contact.depth) if hasattr(contact, 'depth') else 0.0
            if depth > max_depth:
                max_depth = depth
                max_contact = contact
        
        if max_contact is None:
            return 0.0, None, None
        
        point = np.array(max_contact.point) if hasattr(max_contact, 'point') else None
        normal = np.array(max_contact.normal) if hasattr(max_contact, 'normal') else None
        
        return max_depth, point, normal
    except Exception as e:
        print(f"      GJK Error: {e}")
        return 0.0, None, None

def triangle_bvh_collision(mesh1, mesh2):
    """
    Triangle-Triangle collision detection via BVH for complex meshes
    Returns: (penetration_depth, contact_point, contact_normal)
    """
    try:
        # Use trimesh's collision detection with BVH acceleration
        collision_manager = trimesh.collision.CollisionManager()
        collision_manager.add_object('mesh1', mesh1)
        
        is_collision, contact_data = collision_manager.in_collision_single(
            mesh2, return_data=True
        )
        
        if not is_collision or not contact_data or len(contact_data) == 0:
            return 0.0, None, None
        
        # Aggregate all contact points for accurate penetration center
        all_points = []
        max_depth = 0.0
        contact_normal = None
        
        for contact in contact_data:
            depth = abs(contact.depth) if hasattr(contact, 'depth') else 0.0
            if hasattr(contact, 'point') and contact.point is not None:
                all_points.append(np.array(contact.point))
            if depth > max_depth:
                max_depth = depth
                if hasattr(contact, 'normal'):
                    contact_normal = np.array(contact.normal)
        
        # Calculate average contact point from all triangles in collision
        if len(all_points) > 0:
            contact_point = np.mean(all_points, axis=0)
        else:
            contact_point = None
        
        return max_depth, contact_point, contact_normal
    except Exception as e:
        print(f"      Triangle-BVH Error: {e}")
        return 0.0, None, None

def calculate_clash_position_accurate(contact_point, contact_normal, penetration_depth, obj1_aabb, obj2_aabb):
    """
    Calculate accurate clash position (center of penetration volume)
    
    Uses AABB intersection for robustness, avoiding assumptions about contact_normal direction.
    
    Args:
        contact_point: Point of contact from collision detection
        contact_normal: Normal vector of collision
        penetration_depth: Depth of penetration (can be positive or negative)
        obj1_aabb: AABB of first object
        obj2_aabb: AABB of second object
    
    Returns:
        clash_pos: 3D position of clash center
    """
    # Priority 1: Use AABB intersection volume center (most robust)
    if obj1_aabb is not None and obj2_aabb is not None:
        # Calculate intersection of two AABBs
        overlap_min = np.maximum(obj1_aabb.min, obj2_aabb.min)
        overlap_max = np.minimum(obj1_aabb.max, obj2_aabb.max)
        
        # Check if AABBs actually intersect
        if np.all(overlap_max > overlap_min):
            # Center of overlap volume
            clash_pos = (overlap_min + overlap_max) / 2.0
            return clash_pos
    
    # Priority 2: Use contact point alone (from collision data)
    if contact_point is not None:
        return contact_point
    
    # Priority 3: Fallback to AABB center midpoint
    if obj1_aabb is not None and obj2_aabb is not None:
        center1 = obj1_aabb.center()
        center2 = obj2_aabb.center()
        clash_pos = (center1 + center2) / 2.0
        return clash_pos
    
    # Priority 4: Unable to calculate (shouldn't reach)
    return None

def get_db_connection():
    """Create PostgreSQL connection"""
    return psycopg2.connect(**DB_CONFIG)

def get_minio_client():
    """Create MinIO client"""
    return Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_USE_SSL
    )

def update_report_status(report_id, status, progress, message=None):
    """Update clash report status in database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE clash_reports 
            SET status = %s, progress = %s, status_message = %s, updated_at = NOW()
            WHERE id = %s
        """, (status, progress, message, report_id))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print(f"Updated report {report_id}: {status} ({progress}%) - {message}")
    except Exception as e:
        print(f"Error updating report status: {e}")

# ============================================================================
# CLASH MATRIX
# ============================================================================

def should_check_clash(cat1, cat2):
    """Check if two categories should be tested for clashes"""
    # Check clearance rules - includes same-category rules like 'pipes': {'pipes': 0.05}
    if cat1 in CLEARANCE_RULES and cat2 in CLEARANCE_RULES[cat1]:
        return True
    if cat2 in CLEARANCE_RULES and cat1 in CLEARANCE_RULES[cat2]:
        return True
    
    return False

def get_clearance(cat1, cat2):
    """Get required clearance distance between two categories"""
    if cat1 in CLEARANCE_RULES and cat2 in CLEARANCE_RULES[cat1]:
        return CLEARANCE_RULES[cat1][cat2]
    if cat2 in CLEARANCE_RULES and cat1 in CLEARANCE_RULES[cat2]:
        return CLEARANCE_RULES[cat2][cat1]
    return 0.0

# ============================================================================
# GEOMETRY UTILITIES
# ============================================================================

class AABB:
    """Axis-Aligned Bounding Box"""
    def __init__(self, min_point, max_point):
        self.min = np.array(min_point)
        self.max = np.array(max_point)
    
    @classmethod
    def from_mesh(cls, mesh):
        """Create AABB from mesh bounds"""
        return cls(mesh.bounds[0], mesh.bounds[1])
    
    def intersects(self, other, clearance=0.0):
        """Check if this AABB intersects another with clearance"""
        return (
            self.min[0] - clearance <= other.max[0] and
            self.max[0] + clearance >= other.min[0] and
            self.min[1] - clearance <= other.max[1] and
            self.max[1] + clearance >= other.min[1] and
            self.min[2] - clearance <= other.max[2] and
            self.max[2] + clearance >= other.min[2]
        )
    
    def center(self):
        """Get center point of AABB"""
        return (self.min + self.max) / 2
    
    def volume(self):
        """Get volume of AABB"""
        size = self.max - self.min
        return size[0] * size[1] * size[2]

def calculate_penetration_depth_advanced(mesh1, mesh2):
    """
    Advanced collision detection with algorithm selection based on mesh type
    
    Pipeline:
    1. Detect mesh types (primitive vs complex)
    2. Select appropriate algorithm:
       - Box + Box → SAT
       - Box/Cylinder + Any → GJK
       - Complex meshes → Triangle-BVH
    3. Extract contact data with normal and depth
    
    Returns: (penetration_depth, contact_point, contact_normal, mesh_type1, mesh_type2)
    """
    try:
        # Step 1: Detect mesh types
        mesh_type1 = detect_primitive_type(mesh1)
        mesh_type2 = detect_primitive_type(mesh2)
        
        penetration = 0.0
        contact_point = None
        contact_normal = None
        
        # Step 2: Select collision algorithm based on mesh types
        if mesh_type1 == 'box' and mesh_type2 == 'box':
            # Box-Box collision using SAT
            penetration, contact_point, contact_normal = sat_collision(mesh1, mesh2)
        
        elif mesh_type1 in ['box', 'cylinder'] or mesh_type2 in ['box', 'cylinder']:
            # Any primitive with GJK
            penetration, contact_point, contact_normal = gjk_collision(mesh1, mesh2)
        
        elif mesh_type1 == 'convex' or mesh_type2 == 'convex':
            # Convex mesh with GJK
            penetration, contact_point, contact_normal = gjk_collision(mesh1, mesh2)
        
        else:
            # Complex meshes use Triangle-BVH
            penetration, contact_point, contact_normal = triangle_bvh_collision(mesh1, mesh2)
        
        return penetration, contact_point, contact_normal, mesh_type1, mesh_type2
        
    except Exception as e:
        print(f"      Error in advanced collision detection: {e}")
        return 0.0, None, None, 'complex', 'complex'

def calculate_penetration_depth(mesh1, mesh2):
    """
    Backward compatible wrapper for collision detection
    Returns: (penetration_depth, contact_point)
    """
    penetration, contact_point, _, _, _ = calculate_penetration_depth_advanced(mesh1, mesh2)
    return penetration, contact_point

def classify_severity(penetration_depth):
    """
    Classify clash severity based on penetration depth.
    
    Negative values indicate gaps (clearance violations).
    Positive values indicate actual collisions.
    
    Args:
        penetration_depth: Signed penetration value (negative = gap, positive = overlap)
    
    Returns:
        'critical', 'major', 'minor', or 'clearance'
    """
    # Use absolute value internally for threshold comparison
    abs_penetration = abs(penetration_depth)
    
    if abs_penetration >= SEVERITY_THRESHOLDS['critical']:
        return 'critical'
    elif abs_penetration >= SEVERITY_THRESHOLDS['major']:
        return 'major'
    elif abs_penetration >= SEVERITY_THRESHOLDS['minor']:
        return 'minor'
    else:
        # Small gaps or no overlap
        return 'clearance'

def pick_sample_element(obj, clash_position):
    """
    Pick the most relevant element from an object's metadata based on proximity to clash position.
    Returns: (list of element IDs, sample element dict with detailed info)
    """
    metadata = obj.get('metadata', {})
    if not metadata:
        return [], {}
    
    try:
        # Find element closest to clash position
        best_id = None
        best_dist = float('inf')
        best_info = {}
        
        for global_id, elem_info in metadata.items():
            # Try to get element position (centroid or bbox center)
            elem_pos = None
            
            if 'centroid' in elem_info and elem_info['centroid']:
                elem_pos = np.array(elem_info['centroid'])
            elif 'bbox' in elem_info and elem_info['bbox']:
                # bbox format: [minx, miny, minz, maxx, maxy, maxz]
                bbox = elem_info['bbox']
                if len(bbox) == 6:
                    elem_pos = np.array([
                        (bbox[0] + bbox[3]) / 2,
                        (bbox[1] + bbox[4]) / 2,
                        (bbox[2] + bbox[5]) / 2
                    ])
            
            if elem_pos is not None:
                dist = np.linalg.norm(elem_pos - clash_position)
                if dist < best_dist:
                    best_dist = dist
                    best_id = global_id
                    best_info = elem_info.copy()
        
        if best_id is not None:
            # Return the best element with enriched metadata
            sample_element = {
                'id': best_id,
                'name': best_info.get('Name', ''),
                'type': best_info.get('IfcType', ''),
                'bbox': best_info.get('bbox', []),
                'centroid': best_info.get('centroid', [])
            }
            return [best_id], sample_element
    
    except Exception as e:
        print(f"      Warning: Error picking sample element: {e}")
    
    # Fallback: return first element
    try:
        first_id = next(iter(metadata.keys()))
        first_info = metadata[first_id]
        sample_element = {
            'id': first_id,
            'name': first_info.get('Name', ''),
            'type': first_info.get('IfcType', ''),
            'bbox': first_info.get('bbox', []),
            'centroid': first_info.get('centroid', [])
        }
        return [first_id], sample_element
    except:
        return [], {}

# ============================================================================
# BVH (Bounding Volume Hierarchy)
# ============================================================================

class BVHNode:
    """BVH Node for spatial partitioning"""
    def __init__(self, objects=None, aabb=None):
        self.objects = objects or []
        self.aabb = aabb
        self.left = None
        self.right = None
        self.is_leaf = True
    
    @classmethod
    def build(cls, objects, max_objects_per_node=10):
        """Build BVH tree from list of objects with AABBs"""
        if not objects:
            return None
        
        # Calculate combined AABB
        all_mins = [obj['aabb'].min for obj in objects]
        all_maxs = [obj['aabb'].max for obj in objects]
        combined_min = np.min(all_mins, axis=0)
        combined_max = np.max(all_maxs, axis=0)
        combined_aabb = AABB(combined_min, combined_max)
        
        node = cls(objects, combined_aabb)
        
        # If few objects, make it a leaf
        if len(objects) <= max_objects_per_node:
            return node
        
        # Split objects along longest axis
        extent = combined_max - combined_min
        split_axis = np.argmax(extent)
        
        # Sort objects by center along split axis
        sorted_objects = sorted(objects, key=lambda obj: obj['aabb'].center()[split_axis])
        mid = len(sorted_objects) // 2
        
        # Create child nodes
        node.is_leaf = False
        node.left = cls.build(sorted_objects[:mid], max_objects_per_node)
        node.right = cls.build(sorted_objects[mid:], max_objects_per_node)
        node.objects = []  # Clear objects from non-leaf nodes
        
        return node
    
    def query(self, test_aabb, clearance=0.0):
        """Query BVH for objects whose AABB intersects test_aabb"""
        if not self.aabb.intersects(test_aabb, clearance):
            return []
        
        if self.is_leaf:
            return [obj for obj in self.objects if obj['aabb'].intersects(test_aabb, clearance)]
        
        results = []
        if self.left:
            results.extend(self.left.query(test_aabb, clearance))
        if self.right:
            results.extend(self.right.query(test_aabb, clearance))
        
        return results

# ============================================================================
# MAIN CLASH DETECTION
# ============================================================================

def perform_clash_detection(job_data):
    """Main clash detection logic"""
    report_id = job_data['reportId']
    project_id = job_data['projectId']
    file_ids = job_data['fileIds']
    
    print(f"\n{'='*60}")
    print(f"Starting Clash Detection")
    print(f"Report ID: {report_id}")
    print(f"Project ID: {project_id}")
    print(f"Files: {len(file_ids)}")
    print(f"{'='*60}\n")
    
    update_report_status(report_id, 'processing', 0, 'Loading models...')
    
    try:
        # Step 1: Load all GLB models from MinIO
        print("[1/5] Loading GLB models...")
        minio_client = get_minio_client()
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get file information
        cursor.execute("""
            SELECT id, converted_path, original_name
            FROM bim_files
            WHERE id = ANY(%s) AND status = 'completed'
        """, (file_ids,))
        
        files = cursor.fetchall()
        
        if len(files) != len(file_ids):
            raise Exception(f"Some files are not ready for clash detection")
        
        # Load meshes grouped by category
        models_by_category = {}
        element_metadata = {}  # Store JSON metadata for each element
        total_objects = 0
        
        for file_id, converted_path_json, original_name in files:
            print(f"\n   Processing file: {original_name} (ID: {file_id})")
            converted_models = json.loads(converted_path_json)
            print(f"   Found {len(converted_models)} categories in this file")
            
            for model_info in converted_models:
                category = model_info['category']
                glb_path = model_info['glb_path']
                json_path = model_info.get('json_path', '')
                element_count = model_info.get('element_count', 0)
                
                print(f"\n   -> Category: {category} ({element_count} elements)")
                
                # Download GLB from MinIO
                temp_glb = f"/tmp/{file_id}_{category}.glb"
                print(f"      Downloading GLB from MinIO: {glb_path}")
                minio_client.fget_object(MINIO_BUCKET, glb_path, temp_glb)
                
                glb_size_mb = os.path.getsize(temp_glb) / (1024 * 1024)
                print(f"      [OK] Downloaded GLB: {glb_size_mb:.2f} MB")
                
                # Download JSON metadata from MinIO
                element_data = {}
                if json_path:
                    try:
                        temp_json = f"/tmp/{file_id}_{category}.json"
                        print(f"      Downloading JSON metadata: {json_path}")
                        minio_client.fget_object(MINIO_BUCKET, json_path, temp_json)
                        
                        json_size_kb = os.path.getsize(temp_json) / 1024
                        print(f"      [OK] Downloaded JSON: {json_size_kb:.2f} KB")
                        
                        with open(temp_json, 'r') as f:
                            element_data = json.load(f)
                        
                        os.remove(temp_json)
                        print(f"      [OK] Loaded metadata for {len(element_data)} {category} elements")
                    except Exception as e:
                        print(f"      [WARNING] Could not load JSON metadata for {category}: {e}")
                else:
                    print(f"       No JSON metadata path found for {category}")
                
                # Load mesh with trimesh
                print(f"      Loading mesh with Trimesh...")
                scene_or_mesh = trimesh.load(temp_glb)
                
                # Handle Scene vs single Mesh
                if isinstance(scene_or_mesh, trimesh.Scene):
                    # GLB contains multiple meshes with transforms
                    print(f"      [OK] Loaded Scene with {len(scene_or_mesh.geometry)} geometries")
                    
                    if len(scene_or_mesh.geometry) == 0:
                        print(f"      [WARNING] Scene has no geometries, skipping")
                        os.remove(temp_glb)
                        continue
                    
                    # CRITICAL FIX: Use dump(concatenate=True) to apply scene transforms
                    # This ensures all mesh vertices are in world space, matching Three.js
                    mesh = scene_or_mesh.dump(concatenate=True)
                    print(f"      [OK] Dumped+concatenated mesh with transforms: {mesh.vertices.shape[0]} vertices, {mesh.faces.shape[0]} faces")
                else:
                    # Single mesh
                    mesh = scene_or_mesh
                    print(f"      [OK] Mesh loaded: {mesh.vertices.shape[0]} vertices, {mesh.faces.shape[0]} faces")
                
                # Store mesh with metadata
                if category not in models_by_category:
                    models_by_category[category] = []
                
                model_obj = {
                    'file_id': file_id,
                    'category': category,
                    'mesh': mesh,
                    'aabb': AABB.from_mesh(mesh),
                    'original_name': original_name,
                    'element_count': model_info.get('element_count', 0),
                    'metadata': element_data  # Add metadata to model
                }
                
                models_by_category[category].append(model_obj)
                
                # Store element metadata for clash enrichment
                for global_id, elem_info in element_data.items():
                    element_metadata[global_id] = elem_info
                
                total_objects += 1
                
                # Cleanup temp file
                os.remove(temp_glb)
                print(f"      [OK] Cleaned up temporary GLB file")
        
        print(f"\n   {'='*50}")
        print(f"   SUMMARY: Loaded {total_objects} models across {len(models_by_category)} categories")
        print(f"   Total element metadata records: {len(element_metadata)}")
        for cat, models in models_by_category.items():
            total_elements = sum(m['element_count'] for m in models)
            print(f"   - {cat}: {len(models)} file(s), {total_elements} elements")
        print(f"   {'='*50}\n")
        print(f"   Loaded {total_objects} models across {len(models_by_category)} categories")
        update_report_status(report_id, 'processing', 20, f'Loaded {total_objects} models')
        
        # Step 2: Build BVH for each category
        print("\n[2/5] Building BVH trees...")
        print("   BVH (Bounding Volume Hierarchy) enables O(log n) spatial queries")
        bvh_trees = {}
        for category, objects in models_by_category.items():
            print(f"\n   -> Building BVH for {category}...")
            print(f"      Objects to index: {len(objects)}")
            
            start_time = time.time()
            bvh_trees[category] = BVHNode.build(objects)
            build_time = time.time() - start_time
            
            print(f"      [OK] BVH built in {build_time:.2f}s")
            print(f"      Tree structure: Root -> Internal Nodes -> {len(objects)} Leaf Nodes")
        
        print(f"\n   {'='*50}")
        print(f"   All BVH trees constructed successfully!")
        print(f"   {'='*50}\n")
        
        update_report_status(report_id, 'processing', 40, 'BVH trees built')
        
        # Step 3: Perform clash detection using clash matrix
        print("\n[3/5] Detecting clashes...")
        clashes = []
        clash_id = 1
        
        categories = list(models_by_category.keys())
        
        # Count total pairs: cross-category + same-category
        cross_cat_pairs = sum(1 for i, cat1 in enumerate(categories) 
                             for cat2 in categories[i+1:] 
                             if should_check_clash(cat1, cat2))
        same_cat_pairs = sum(1 for cat in categories if should_check_clash(cat, cat))
        total_pairs = cross_cat_pairs + same_cat_pairs
        
        print(f"   Clash matrix check: {total_pairs} category pairs to analyze")
        print(f"   Categories available: {', '.join(categories)}\n")
        current_pair = 0
        
        for i, cat1 in enumerate(categories):
            # Check same-category clashes (e.g., pipes vs pipes)
            if should_check_clash(cat1, cat1):
                current_pair += 1
                clearance = get_clearance(cat1, cat1)
                
                print(f"\n   [{current_pair}/{total_pairs}] Checking {cat1} vs {cat1} (same category)")
                print(f"      Required clearance: {clearance*100:.1f} cm")
                
                objects1 = models_by_category[cat1]
                print(f"      Objects in {cat1}: {len(objects1)}")
                
                pair_clashes_found = 0
                broad_phase_checks = 0
                narrow_phase_checks = 0
                
                # Check each pair within the same category (avoid duplicates and self)
                for idx1, obj1 in enumerate(objects1):
                    candidates = bvh_trees[cat1].query(obj1['aabb'], clearance)
                    broad_phase_checks += len(candidates)
                    
                    for obj2 in candidates:
                        # Skip self-collision and already-checked pairs
                        if obj1 is obj2 or objects1.index(obj2) <= idx1:
                            continue
                        
                        narrow_phase_checks += 1
                        
                        # Narrow phase: advanced collision detection
                        penetration, contact_point, contact_normal, mesh_type1, mesh_type2 = \
                            calculate_penetration_depth_advanced(obj1['mesh'], obj2['mesh'])
                        
                        if penetration > 0 or penetration < -clearance:
                            severity = classify_severity(penetration)
                            pair_clashes_found += 1
                            
                            clash_pos = calculate_clash_position_accurate(
                                contact_point, contact_normal, penetration,
                                obj1['aabb'], obj2['aabb']
                            )
                            
                            if penetration > 0.001:
                                algo_used = 'SAT' if mesh_type1 == 'box' and mesh_type2 == 'box' else \
                                           'GJK' if mesh_type1 in ['box', 'cylinder', 'convex'] or mesh_type2 in ['box', 'cylinder', 'convex'] else \
                                           'Triangle-BVH'
                                print(f"        Clash Algorithm: {algo_used} ({mesh_type1} vs {mesh_type2}), Depth: {penetration*100:.2f}cm")
                            
                            obj1_element_ids, obj1_sample_element = pick_sample_element(obj1, clash_pos)
                            obj2_element_ids, obj2_sample_element = pick_sample_element(obj2, clash_pos)
                            
                            clashes.append({
                                'clash_id': clash_id,
                                'severity': severity,
                                'penetration_depth': float(abs(penetration)),
                                'clearance_required': float(clearance),
                                'position': {
                                    'x': float(clash_pos[0]),
                                    'y': float(clash_pos[1]),
                                    'z': float(clash_pos[2])
                                },
                                'object1': {
                                    'file_id': obj1['file_id'],
                                    'file_name': obj1['original_name'],
                                    'category': obj1['category'],
                                    'element_count': obj1.get('element_count', 0),
                                    'element_ids': obj1_element_ids,
                                    'sample_element': obj1_sample_element
                                },
                                'object2': {
                                    'file_id': obj2['file_id'],
                                    'file_name': obj2['original_name'],
                                    'category': obj2['category'],
                                    'element_count': obj2.get('element_count', 0),
                                    'element_ids': obj2_element_ids,
                                    'sample_element': obj2_sample_element
                                }
                            })
                            clash_id += 1
                
                print(f"      [OK] Broad-phase checks (AABB): {broad_phase_checks}")
                print(f"      [OK] Narrow-phase checks (Trimesh): {narrow_phase_checks}")
                print(f"      [OK] Clashes found in this pair: {pair_clashes_found}")
                
                progress = 40 + int((current_pair / total_pairs) * 40)
                update_report_status(report_id, 'processing', progress, 
                                   f'Detected {len(clashes)} clashes')
            
            # Check cross-category clashes (avoid duplicates with i+1)
            for cat2 in categories[i+1:]:
                if not should_check_clash(cat1, cat2):
                    continue
                
                current_pair += 1
                clearance = get_clearance(cat1, cat2)
                
                print(f"\n   [{current_pair}/{total_pairs}] Checking {cat1} vs {cat2}")
                print(f"      Required clearance: {clearance*100:.1f} cm")
                
                objects1 = models_by_category[cat1]
                objects2 = models_by_category[cat2]
                
                print(f"      Objects in {cat1}: {len(objects1)}")
                print(f"      Objects in {cat2}: {len(objects2)}")
                   
                pair_clashes_found = 0
                broad_phase_checks = 0
                narrow_phase_checks = 0
                
                # For each object in cat1, query BVH of cat2
                for obj1 in objects1:
                    candidates = bvh_trees[cat2].query(obj1['aabb'], clearance)
                    broad_phase_checks += len(candidates)
                    
                    for obj2 in candidates:
                        # Skip self-collision
                        if obj1 is obj2:
                            continue
                        
                        narrow_phase_checks += 1
                        
                        # Narrow phase: advanced collision detection with algorithm selection
                        penetration, contact_point, contact_normal, mesh_type1, mesh_type2 = \
                            calculate_penetration_depth_advanced(obj1['mesh'], obj2['mesh'])
                        
                        if penetration > 0 or penetration < -clearance:
                            severity = classify_severity(penetration)
                            pair_clashes_found += 1
                            
                            # Calculate accurate clash position (center of penetration volume)
                            clash_pos = calculate_clash_position_accurate(
                                contact_point, contact_normal, penetration,
                                obj1['aabb'], obj2['aabb']
                            )
                            
                            # Debug: Log collision algorithm used
                            if penetration > 0.001:  # Only log if significant clash
                                algo_used = 'SAT' if mesh_type1 == 'box' and mesh_type2 == 'box' else \
                                           'GJK' if mesh_type1 in ['box', 'cylinder', 'convex'] or mesh_type2 in ['box', 'cylinder', 'convex'] else \
                                           'Triangle-BVH'
                                print(f"        Clash Algorithm: {algo_used} ({mesh_type1} vs {mesh_type2}), Depth: {penetration*100:.2f}cm")
                            
                            # Pick the most relevant elements from each object
                            obj1_element_ids, obj1_sample_element = pick_sample_element(obj1, clash_pos)
                            obj2_element_ids, obj2_sample_element = pick_sample_element(obj2, clash_pos)
                            
                            clashes.append({
                                'clash_id': clash_id,
                                'severity': severity,
                                'penetration_depth': float(abs(penetration)),
                                'clearance_required': float(clearance),
                                'position': {
                                    'x': float(clash_pos[0]),
                                    'y': float(clash_pos[1]),
                                    'z': float(clash_pos[2])
                                },
                                'object1': {
                                    'file_id': obj1['file_id'],
                                    'file_name': obj1['original_name'],
                                    'category': obj1['category'],
                                    'element_count': obj1.get('element_count', 0),
                                    'element_ids': obj1_element_ids,
                                    'sample_element': obj1_sample_element
                                },
                                'object2': {
                                    'file_id': obj2['file_id'],
                                    'file_name': obj2['original_name'],
                                    'category': obj2['category'],
                                    'element_count': obj2.get('element_count', 0),
                                    'element_ids': obj2_element_ids,
                                    'sample_element': obj2_sample_element
                                }
                            })
                            
                            clash_id += 1
                
                # Update progress and log statistics for this pair
                print(f"      [OK] Broad-phase checks (AABB): {broad_phase_checks}")
                print(f"      [OK] Narrow-phase checks (Trimesh): {narrow_phase_checks}")
                print(f"      [OK] Clashes found in this pair: {pair_clashes_found}")
                
                progress = 40 + int((current_pair / total_pairs) * 40)
                update_report_status(report_id, 'processing', progress, 
                                   f'Detected {len(clashes)} clashes')
        
        print(f"\n   {'='*50}")
        print(f"   CLASH DETECTION COMPLETE")
        print(f"   Total clashes found: {len(clashes)}")
        print(f"   {'='*50}\n")
        
        # Step 4: Categorize clashes by severity
        print("\n[4/5] Categorizing clashes by severity...")
        critical_count = sum(1 for c in clashes if c['severity'] == 'critical')
        major_count = sum(1 for c in clashes if c['severity'] == 'major')
        minor_count = sum(1 for c in clashes if c['severity'] == 'minor')
        
        print(f"   Critical (>10cm penetration): {critical_count}")
        print(f"   Major (5-10cm penetration): {major_count}")
        print(f"   Minor (1-5cm penetration): {minor_count}")
        
        update_report_status(report_id, 'processing', 85, 'Saving results...')
        
        # Step 5: Save results to database
        print("\n[5/5] Saving clash report to database...")
        print(f"   Report ID: {report_id}")
        print(f"   Total data size: {len(json.dumps(clashes))/1024:.2f} KB")
        
        # Update clash report with results
        cursor.execute("""
            UPDATE clash_reports
            SET 
                status = %s,
                progress = 100,
                total_clashes = %s,
                critical_clashes = %s,
                major_clashes = %s,
                minor_clashes = %s,
                clashes_data = %s,
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = %s
        """, (
            'completed',
            len(clashes),
            critical_count,
            major_count,
            minor_count,
            json.dumps(clashes),
            report_id
        ))
        
        print(f"   [OK] Database updated successfully")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        update_report_status(report_id, 'completed', 100, 
                           f'Found {len(clashes)} clashes ({critical_count} critical)')
        
        print(f"\n{'='*60}")
        print(f"Clash Detection Completed Successfully!")
        print(f"{'='*60}\n")
        
        return True
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        update_report_status(report_id, 'failed', 0, str(e))
        return False

# ============================================================================
# RABBITMQ CONSUMER
# ============================================================================

def callback(ch, method, properties, body):
    """RabbitMQ message callback"""
    try:
        message = json.loads(body.decode())
        print(f"\n>>> Received clash detection job: {message['reportId']}")
        
        # Process clash detection
        success = perform_clash_detection(message)
        
        if success:
            ch.basic_ack(delivery_tag=method.delivery_tag)
            print(f">>> Job completed and acknowledged")
        else:
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            print(f">>> Job failed and rejected")
            
    except Exception as e:
        print(f"ERROR processing message: {e}")
        import traceback
        traceback.print_exc()
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

def start_consumer():
    """Start RabbitMQ consumer"""
    print(f"\n{'='*60}")
    print(f"BIM Clash Detection Worker")
    print(f"{'='*60}")
    print(f"RabbitMQ URL: {RABBITMQ_URL}")
    print(f"Queue: {RABBITMQ_QUEUE}")
    print(f"MinIO Bucket: {MINIO_BUCKET}")
    print(f"{'='*60}\n")
    
    # Parse RabbitMQ URL
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    
    # Declare queue with same settings as publisher
    channel.queue_declare(
        queue=RABBITMQ_QUEUE,
        durable=True,
        arguments={'x-message-ttl': 86400000}  # 24 hours
    )
    
    # Set QoS - process one message at a time
    channel.basic_qos(prefetch_count=1)
    
    # Start consuming
    channel.basic_consume(
        queue=RABBITMQ_QUEUE,
        on_message_callback=callback,
        auto_ack=False
    )
    
    print("Connected! Waiting for clash detection jobs...")
    print("Press Ctrl+C to exit\n")
    
    try:
        channel.start_consuming()
    except KeyboardInterrupt:
        print("\nShutting down...")
        channel.stop_consuming()
    
    connection.close()

# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    start_consumer()

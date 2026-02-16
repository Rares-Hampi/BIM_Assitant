import bpy
import sys
import os
import re
import ifcopenshell
import ifcopenshell.util.selector

# --- CONFIG ---
INPUT_IFC = "/workspace/NBU_MedicalClinic_Eng-MEP.ifc"
OUTPUT_DIR = "/workspace/separated_models/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 1. OPTIMIZATION
DECIMATE_RATIO = 0.5         
DRACO_COMPRESSION_LEVEL = 6  

# 2. KEYWORD CLASSIFICATION
KEYWORDS = {
    "ducts": ["duct", "grille", "diffuser", "exhaust", "supply", "return", "damper", "fcu", "fan", "air terminal"],
    "pipes": ["pipe", "water", "sanitary", "sewer", "drain", "waste", "valve", "faucet", "sink", "sprinkler", "pump"],
    "electrical": ["cable", "tray", "wire", "conduit", "switch", "socket", "panel", "lighting", "detector"]
}

def get_category_from_ifc(element):
    """Decides category based on Name Analysis (Text Mining)."""
    name = (element.Name or "").lower()
    obj_type = (element.ObjectType or "").lower()
    full_text = f"{name} {obj_type}"
    entity_type = element.is_a()

    for category, words in KEYWORDS.items():
        for word in words:
            if word in full_text:
                return category

    if entity_type in ["IfcWall", "IfcWallStandardCase", "IfcCurtainWall"]: return "walls"
    if entity_type == "IfcSlab": return "slabs"
    if entity_type in ["IfcDoor", "IfcWindow"]: return "doors_windows"

    return "others"

def extract_id_from_name(obj_name):
    """
    Fallback: Tries to pull the Step ID from the end of the name.
    Example: "IfcPipeSegment/ColdWater:1054501" -> 1054501
    """
    # Look for a group of digits at the very end of the string
    match = re.search(r'[:/](\d+)$', obj_name)
    if match:
        return int(match.group(1))
    return None

def main():
    # --- STEP 1: PARSE DATA (IfcOpenShell) ---
    print(f"[1/4] Parsing Data with IfcOpenShell...")
    ifc_file = ifcopenshell.open(INPUT_IFC)
    
    id_category_map = {}
    products = ifc_file.by_type("IfcProduct")
    
    for product in products:
        cat = get_category_from_ifc(product)
        id_category_map[product.id()] = cat
        
    print(f"      Classified {len(id_category_map)} elements via Name Analysis.")

    # --- STEP 2: LOAD GEOMETRY (Blender) ---
    print(f"[2/4] Loading Geometry in Blender...")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module="blenderbim")
        # Turn OFF fast mode to ensure we get better naming/properties
        bpy.context.preferences.addons['blenderbim'].preferences.import_fast_mode = False 
    except:
        pass

    print(f"Importing: {INPUT_IFC}")
    bpy.ops.bim.load_project(filepath=INPUT_IFC)

    # --- STEP 3: SORT BLENDER OBJECTS ---
    print(f"[3/4] Sorting Blender Objects...")
    
    collections = {}
    unique_cats = set(id_category_map.values())
    for cat in unique_cats:
        col = bpy.data.collections.new(cat)
        bpy.context.scene.collection.children.link(col)
        collections[cat] = col

    scene_objects = [o for o in bpy.data.objects]
    count_moved = 0
    
    # Debug: Print first object to verify our ID extraction logic
    if scene_objects:
        print(f"DEBUG: First Object Name: '{scene_objects[0].name}'")
        print(f"DEBUG: Extracted ID: {extract_id_from_name(scene_objects[0].name)}")

    for obj in scene_objects:
        step_id = None
        
        # STRATEGY 1: Property Group (Standard)
        if hasattr(obj, "BIMObject") and obj.BIMObject.ifc_definition_id:
            step_id = obj.BIMObject.ifc_definition_id
            
        # STRATEGY 2: Dictionary Access (Legacy/Fallback)
        elif "ifc_definition_id" in obj:
            step_id = int(obj["ifc_definition_id"])
            
        # STRATEGY 3: Check Parent (Container)
        elif obj.parent:
            if hasattr(obj.parent, "BIMObject") and obj.parent.BIMObject.ifc_definition_id:
                step_id = obj.parent.BIMObject.ifc_definition_id
            elif "ifc_definition_id" in obj.parent:
                step_id = int(obj.parent["ifc_definition_id"])

        # STRATEGY 4: Name Regex (The Nuclear Option)
        # If the API fails, we read the ID from the name string "Object:12345"
        if not step_id:
            step_id = extract_id_from_name(obj.name)
            if not step_id and obj.parent:
                step_id = extract_id_from_name(obj.parent.name)

        # LINK & MOVE
        if step_id and step_id in id_category_map:
            category = id_category_map[step_id]
            target_obj = obj
            
            try:
                # Unlink from old
                for old_col in target_obj.users_collection:
                    old_col.objects.unlink(target_obj)
                
                # Link to new
                collections[category].objects.link(target_obj)
                
                target_obj["category"] = category
                count_moved += 1
            except Exception:
                pass

    print(f"      Sorted {count_moved} objects.")

    # --- STEP 4: EXPORT ---
    print(f"[4/4] Exporting GLB Files...")
    
    bpy.ops.object.select_all(action='DESELECT')

    for cat, col in collections.items():
        if len(col.objects) == 0:
            continue
            
        output_path = os.path.join(OUTPUT_DIR, f"{cat}.glb")
        
        # Select objects in this collection + their children
        for obj in col.objects:
            obj.select_set(True)
            for child in obj.children:
                child.select_set(True)

        if not bpy.context.selected_objects:
            continue

        print(f"      Exporting {cat}.glb ({len(bpy.context.selected_objects)} objects)...")
        
        # Decimate logic
        should_decimate = (DECIMATE_RATIO < 1.0) and (cat not in ["pipes", "ducts", "electrical"])
        modifiers_added = []
        
        if should_decimate:
             for obj in bpy.context.selected_objects:
                if obj.type == 'MESH':
                    bpy.context.view_layer.objects.active = obj
                    mod = obj.modifiers.new(name="Decimate", type='DECIMATE')
                    mod.ratio = DECIMATE_RATIO
                    modifiers_added.append(obj)

        draco_settings = {}
        if DRACO_COMPRESSION_LEVEL > 0:
            draco_settings = {
                "export_draco_mesh_compression_enable": True,
                "export_draco_mesh_compression_level": DRACO_COMPRESSION_LEVEL,
            }

        bpy.ops.export_scene.gltf(
            filepath=output_path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_extras=True,
            export_materials='NONE',
            **draco_settings
        )
        
        if should_decimate:
            for obj in modifiers_added:
                if "Decimate" in obj.modifiers:
                    obj.modifiers.remove(obj.modifiers["Decimate"])
        
        bpy.ops.object.select_all(action='DESELECT')

    print("[DONE] Process Complete.")

if __name__ == "__main__":
    main()
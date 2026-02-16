import bpy
import sys
import os
import ifcopenshell
import ifcopenshell.util.selector

# --- CONFIG ---
INPUT_IFC = "/workspace/NBU_MedicalClinic_Eng-MEP.ifc"
OUTPUT_DIR = "/workspace/separated_models/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 1. CLASSIFICATION LOGIC
KEYWORDS = {
    "ducts": ["duct", "grille", "diffuser", "exhaust", "supply", "return", "damper", "fcu", "fan", "air terminal"],
    "pipes": ["pipe", "water", "sanitary", "sewer", "drain", "waste", "valve", "faucet", "sink", "sprinkler", "pump"],
    "electrical": ["cable", "tray", "wire", "conduit", "switch", "socket", "panel", "lighting", "detector"]
}

def get_category_from_ifc(element):
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

def main():
    # --- STEP 1: LOAD DATA (IFCOPENSHELL) ---
    print(f"[1/4] Parsing Data with IfcOpenShell...")
    ifc_file = ifcopenshell.open(INPUT_IFC)
    
    id_category_map = {}
    products = ifc_file.by_type("IfcProduct")
    
    for product in products:
        cat = get_category_from_ifc(product)
        id_category_map[product.id()] = cat
        
    print(f"      Classified {len(id_category_map)} elements via IFC data.")

    # --- STEP 2: LOAD GEOMETRY (BLENDER) ---
    print(f"[2/4] Loading Geometry in Blender...")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.preferences.addon_enable(module="blenderbim")
        bpy.context.preferences.addons['blenderbim'].preferences.import_fast_mode = False 
    except:
        pass

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
    
    # --- DEBUG: Print structure of first object to see where ID is ---
    if len(scene_objects) > 0:
        obj = scene_objects[0]
        print(f"DEBUG INSPECTION: {obj.name}")
        print(f"  - Keys: {obj.keys()}")
        if hasattr(obj, "BIMObject"):
            print(f"  - BIMObject ID: {obj.BIMObject.ifc_definition_id}")

    for obj in scene_objects:
        step_id = None
        
        # STRATEGY A: Check New PropertyGroup (BIMObject)
        if hasattr(obj, "BIMObject") and obj.BIMObject.ifc_definition_id:
            step_id = obj.BIMObject.ifc_definition_id
            
        # STRATEGY B: Check Legacy Custom Property (obj["ifc_definition_id"])
        elif "ifc_definition_id" in obj:
            step_id = int(obj["ifc_definition_id"])
            
        # STRATEGY C: Check Parent (If obj is a Mesh child of an Empty)
        elif obj.parent:
            if hasattr(obj.parent, "BIMObject") and obj.parent.BIMObject.ifc_definition_id:
                step_id = obj.parent.BIMObject.ifc_definition_id
            elif "ifc_definition_id" in obj.parent:
                step_id = int(obj.parent["ifc_definition_id"])

        # If we found an ID and it matches our list
        if step_id and step_id in id_category_map:
            category = id_category_map[step_id]
            
            # If this is a MESH, move it. If it's an Empty, move it.
            # We want to move the visible geometry.
            target_obj = obj
            
            try:
                # Unlink from all current collections
                for old_col in target_obj.users_collection:
                    old_col.objects.unlink(target_obj)
                
                # Link to new collection
                collections[category].objects.link(target_obj)
                
                # Inject Metadata
                target_obj["category"] = category
                count_moved += 1
            except Exception as e:
                print(f"Error moving {target_obj.name}: {e}")

    print(f"      Sorted {count_moved} Blender objects into collections.")

    # --- STEP 4: EXPORT SEPARATE GLBS ---
    print(f"[4/4] Exporting GLB Files...")
    
    bpy.ops.object.select_all(action='DESELECT')

    for cat, col in collections.items():
        if len(col.objects) == 0:
            continue
            
        # Select objects in this collection
        for obj in col.objects:
            obj.select_set(True)
            # Select children (meshes) if we selected the parent (empty)
            for child in obj.children:
                child.select_set(True)

        # Double check we have selection
        if not bpy.context.selected_objects:
            continue

        output_path = os.path.join(OUTPUT_DIR, f"{cat}.glb")
        print(f"      Exporting {cat}.glb ({len(bpy.context.selected_objects)} objects)...")
        
        bpy.ops.export_scene.gltf(
            filepath=output_path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_extras=True,
            export_materials='NONE',
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6
        )
        
        bpy.ops.object.select_all(action='DESELECT')

    print("[DONE] Process Complete.")

if __name__ == "__main__":
    main()
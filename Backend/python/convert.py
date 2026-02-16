import bpy
import sys
import os
import json
import ifcopenshell
import ifcopenshell.util.selector

# --- CONFIG ---
input_ifc = "/workspace/NBU_MedicalClinic_Eng-MEP.ifc"
output_dir = "/workspace/separated_models/"
os.makedirs(output_dir, exist_ok=True)

# --- OPTIMIZATION CONFIG ---
DECIMATE_RATIO = 0.5         
DRACO_COMPRESSION_LEVEL = 6  

DISCIPLINE_MAP = {
    "pipes": "IfcPipeSegment, IfcPipeFitting",
    "ducts": "IfcDuctSegment, IfcDuctFitting, IfcAirTerminal",
    "electrical": "IfcCableTraySegment, IfcLightFixture, IfcOutlet, IfcSwitch",
    "walls": "IfcWall, IfcWallStandardCase, IfcCurtainWall",
    "slabs": "IfcSlab",
}

# --- STEP 1: Dependencies ---
sys.path.append('/opt/blender-4.2.3-linux-x64/4.2/scripts/addons/blenderbim/libs/site/packages')

# --- STEP 2: Clean & Enable ---
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="blenderbim")

# --- STEP 3: Import IFC ---
try:
    bpy.context.preferences.addons['blenderbim'].preferences.import_fast_mode = False 
except Exception:
    pass

print(f"Importing IFC: {input_ifc}")
bpy.ops.bim.load_project(filepath=input_ifc)
model = ifcopenshell.open(input_ifc)

# --- STEP 4: INDEXING & METADATA ---
print("Indexing scene and injecting rich metadata...")

id_to_obj_map = {}
object_counts = {}

# Get all objects (not just meshes, we need the containers too)
all_objects = bpy.data.objects
print(f"Blender found {len(all_objects)} total objects.")

# --- DEBUG DIAGNOSTIC (Prints the first 3 objects to log) ---
print("--- DIAGNOSTIC START ---")
for i, obj in enumerate(all_objects[:3]):
    has_bim = hasattr(obj, "BIMObject")
    bim_id = obj.BIMObject.ifc_definition_id if has_bim else "N/A"
    parent = obj.parent.name if obj.parent else "None"
    print(f"Obj: {obj.name} | Type: {obj.type} | HasBIM: {has_bim} | ID: {bim_id} | Parent: {parent}")
print("--- DIAGNOSTIC END ---")
# -----------------------------------------------------------

for obj in all_objects:
    step_id = None
    
    # STRATEGY 1: Check the object itself
    if hasattr(obj, "BIMObject") and obj.BIMObject.ifc_definition_id:
        step_id = obj.BIMObject.ifc_definition_id
        
    # STRATEGY 2: Check the Parent (Crucial for BlenderBIM 4.0+)
    # If this is a Mesh child of a Wall Empty, get the ID from the Wall Empty
    elif obj.parent and hasattr(obj.parent, "BIMObject") and obj.parent.BIMObject.ifc_definition_id:
        step_id = obj.parent.BIMObject.ifc_definition_id
    
    # STRATEGY 3: Legacy Fallback
    elif "ifc_definition_id" in obj:
        step_id = int(obj["ifc_definition_id"])

    if not step_id:
        continue

    # Store the MESH object (if this is a parent container, try to find its mesh child)
    # We want to export the geometry, so we map the ID to the object that has the geometry
    target_obj = obj
    if obj.type != 'MESH':
        # If we found the ID on an Empty, check if it has children with meshes
        children = [child for child in obj.children if child.type == 'MESH']
        if children:
            target_obj = children[0] # Grab the first mesh child
        else:
            # If no mesh children, skip (it might be just a logical group)
            continue

    id_to_obj_map[step_id] = target_obj
    
    # Extract Metadata (Only do this once per unique ID to save time)
    if step_id not in object_counts:
        try:
            ifc_entity = model.by_id(step_id)
            ifc_class = ifcopenshell.util.selector.get_element_value(ifc_entity, "class")
            object_counts[ifc_class] = object_counts.get(ifc_class, 0) + 1

            # Prepare Metadata
            data = {
                "GlobalId": ifc_entity.GlobalId,
                "IfcType": ifc_class,
                "Name": ifc_entity.Name,
                "TypeDefinition": ifcopenshell.util.selector.get_element_value(ifc_entity, "type.Name")
            }
            
            # Attach to the Blender object
            target_obj["ifc_metadata"] = data
            
            # Optional: Add Color Property based on type for the viewer
            if ifc_class == "IfcPipeSegment":
                target_obj["ifc_color"] = "#0000FF" # Example hint for viewer
                
        except Exception:
            pass

print(f"Successfully mapped {len(id_to_obj_map)} objects.")

# --- STEP 5: FILTER & EXPORT ---
print("Exporting separated models...")
bpy.context.view_layer.update()

for discipline_name, query_string in DISCIPLINE_MAP.items():
    print(f"--- Processing: {discipline_name} ---")
    
    filtered_elements = ifcopenshell.util.selector.filter_elements(model, query_string)
    
    bpy.ops.object.select_all(action='DESELECT')
    objects_to_export = []
    
    for element in filtered_elements:
        if element.id() in id_to_obj_map:
            obj = id_to_obj_map[element.id()]
            
            # Ensure the object is visible and selectable
            obj.hide_set(False)
            obj.select_set(True)
            objects_to_export.append(obj)
            
    if not objects_to_export:
        print(f"    No objects found (Query: {query_string})")
        continue

    print(f"    Found {len(objects_to_export)} objects.")

    should_decimate = (DECIMATE_RATIO < 1.0) and (discipline_name not in ["pipes", "ducts", "electrical"])
    
    modifiers_added = []
    
    if should_decimate:
        for obj in objects_to_export:
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new(name="DecimateExport", type='DECIMATE')
            mod.ratio = DECIMATE_RATIO
            modifiers_added.append(obj)

    draco_settings = {}
    if DRACO_COMPRESSION_LEVEL > 0:
        draco_settings = {
            "export_draco_mesh_compression_enable": True,
            "export_draco_mesh_compression_level": DRACO_COMPRESSION_LEVEL,
        }

    output_gltf = os.path.join(output_dir, f"{discipline_name}.glb")
    
    bpy.ops.export_scene.gltf(
        filepath=output_gltf,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_texcoords=False,
        export_normals=True,
        export_yup=True,
        export_materials='NONE',
        export_extras=True,
        **draco_settings
    )
    
    if should_decimate:
        for obj in modifiers_added:
            if "DecimateExport" in obj.modifiers:
                obj.modifiers.remove(obj.modifiers["DecimateExport"])

# --- STEP 6: STATISTICS ---
stats_path = os.path.join(output_dir, "statistics.json")
final_stats = {
    "filename": os.path.basename(input_ifc),
    "total_objects": sum(object_counts.values()),
    "breakdown": object_counts
}
with open(stats_path, 'w') as json_file:
    json.dump(final_stats, json_file, indent=4)

print("Process complete!")
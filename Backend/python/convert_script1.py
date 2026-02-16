import bpy
import sys
import os
import json  # <--- Added json library

# --- CONFIG ---
input_ifc = "/workspace/NBU_MedicalClinic_Eng-MEP.ifc"
output_dir = "/workspace/separated_models/"
os.makedirs(output_dir, exist_ok=True)

# --- OPTIMIZATION CONFIG ---
DECIMATE_RATIO = 0.5         # 0.5 = 50% reduction (1.0 to disable)
DRACO_COMPRESSION_LEVEL = 6  # 0 to disable

# --- DISCIPLINE MAP ---
DISCIPLINE_MAP = {
    "pipes": ["IfcPipeSegment", "IfcPipeFitting"],
    "ducts": ["IfcDuctSegment", "IfcDuctFitting", "IfcAirTerminal"],
    "electrical": ["IfcCableTraySegment", "IfcLightFixture", "IfcOutlet"],
    "walls": ["IfcWall", "IfcWallStandardCase"],
    "slabs": ["IfcSlab"]
}

# --- STEP 1: Add BlenderBIM's ifcopenshell ---
sys.path.append('/opt/blender-4.2.3-linux-x64/4.2/scripts/addons/blenderbim/libs/site/packages')
import ifcopenshell

# --- STEP 2: Clean scene & Enable Addon ---
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.preferences.addon_enable(module="blenderbim")

# --- STEP 3: Import IFC ---
print("Setting fast import mode...")
try:
    bpy.context.preferences.addons['blenderbim'].preferences.import_fast_mode = True
except Exception:
    pass

print(f"Importing IFC: {input_ifc}")
bpy.ops.bim.load_project(filepath=input_ifc)
f = ifcopenshell.open(input_ifc)

# --- STEP 4: Inject Metadata & COUNT OBJECTS ---
print("Injecting metadata and counting objects...")

# Initialize a dictionary to store counts
object_counts = {} 

# for obj in bpy.data.objects:
#     # Skip objects that aren't part of the IFC import or aren't meshes
#     if "ifc_definition_id" not in obj or obj.type != 'MESH':
#         continue
    
#     try:
#         ifc_entity = f.by_id(int(obj["ifc_definition_id"]))
#         ifc_type = ifc_entity.is_a()
#         i = 0
        
#         # # -- LOGIC: Count the types --
#         # if ifc_entity.Name in object_counts:
#         #     object_counts[ifc_entity.Name] += 1
#         # else:
#         #     object_counts[ifc_entity.Name] = 1
#         # # ----------------------------

#         data = {
#             "GlobalId": ifc_entity.GlobalId,
#             "IfcType": ifc_type,
#             "Name": ifc_entity.Name,
#         }
#         print(data)
#         object_counts[i] = data
#         i += 1
#         obj["ifc_metadata"] = data
#         obj.name = f"{ifc_type}_{obj.name}"
#     except Exception as e:
#         print(f"Failed metadata for {obj.name}: {e}")

# print("Metadata injected.")

# --- STEP 4: Add metadata ---
for obj in bpy.data.objects:
    i = 0
    print(f"Processing object {i}: {obj}")
    object_counts[i] = obj
    if "ifc_definition_id" not in obj:
        print(f"Skipping object {obj.name}: No ifc_definition_id")
        continue
    try:
        ifc_entity = f.by_id(int(obj["ifc_definition_id"]))
        data = {
            "GlobalId": ifc_entity.GlobalId,
            "IfcType": ifc_entity.is_a(),
            "Name": ifc_entity.Name,
            "Storey": ifcopenshell.util.element.get_container(ifc_entity, "IfcBuildingStorey"),
            "Building": ifcopenshell.util.element.get_container(ifc_entity, "IfcBuilding"),
            "Site": ifcopenshell.util.element.get_container(ifc_entity, "IfcSite"),
        }
        try:
            data["Properties"] = ifcopenshell.util.pset.get_psets(ifc_entity)
        except Exception:
            data["Properties"] = {}
        obj["ifc_metadata"] = data
    except Exception as e:
        print(f"Failed metadata for {obj.name}: {e}")

print("Metadata injected.")

# --- STEP 5: Export SEPARATED GLBs ---
print("Exporting separated models...")
bpy.context.view_layer.update()

for discipline_name, ifc_classes in DISCIPLINE_MAP.items():
    print(f"--- Processing: {discipline_name} ---")
    
    bpy.ops.object.select_all(action='DESELECT')
    objects_to_export = []
    
    for obj in bpy.data.objects:
        if obj.get("ifc_metadata") and obj["ifc_metadata"].get("IfcType") in ifc_classes:
            obj.select_set(True)
            objects_to_export.append(obj)
            
    if not objects_to_export:
        continue

    # Apply Decimate Modifier
    if DECIMATE_RATIO < 1.0:
        for obj in objects_to_export:
            bpy.context.view_layer.objects.active = obj
            mod = obj.modifiers.new(name="Decimate", type='DECIMATE')
            mod.ratio = DECIMATE_RATIO

    # Prepare Draco settings
    draco_settings = {}
    if DRACO_COMPRESSION_LEVEL > 0:
        draco_settings = {
            "export_draco_mesh_compression_enable": True,
            "export_draco_mesh_compression_level": DRACO_COMPRESSION_LEVEL,
        }

    # Export
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
        **draco_settings
    )
    
    # Cleanup modifier
    if DECIMATE_RATIO < 1.0:
        for obj in objects_to_export:
            obj.modifiers.remove(obj.modifiers["Decimate"])

# --- STEP 6: Write Statistics to JSON ---
print("Saving statistics...")

stats_path = os.path.join(output_dir, "statistics.json")

# Structure the JSON data nicely
with open(stats_path, 'w') as json_file:
    json.dump(object_counts, json_file, indent=4)

print(f"Statistics saved to {stats_path}")
print("Process complete!")
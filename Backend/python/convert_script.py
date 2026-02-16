# import bpy
# import os
# import sys


# sys.path.append("/addons/blenderbim/IfcOpenShell-blenderbim-210327/src/blenderbim")

# # Enable the add-on
# bpy.ops.preferences.addon_enable(module="blenderbim")

# sys.path.append('/opt/blender-4.2.3-linux-x64/4.2/scripts/addons/blenderbim/libs/site/packages')
# import ifcopenshell
# import ifcopenshell.util.element
# import ifcopenshell.util.pset

# # Enable the add-on
# bpy.ops.preferences.addon_enable(module="blenderbim")

# # --- CONFIG ---
# input_ifc = "/workspace/NBU_MedicalClinic_Eng-MEP.ifc"
# output_gltf = "/workspace/model.glb"

# # --- STEP 1: Clean scene ---
# bpy.ops.wm.read_factory_settings(use_empty=True)

# # --- STEP 2: Verify IFC importer is available ---
# if not hasattr(bpy.ops.import_scene, "ifc"):
#     raise RuntimeError("BlenderBIM not loaded! Check BLENDER_USER_SCRIPTS path or BlenderBIM install.")

# print("BlenderBIM add-on loaded.")

# # --- STEP 3: Import IFC ---
# print(f"Importing IFC: {input_ifc}")
# bpy.ops.import_ifc.bim(filepath=input_ifc)

# f = ifcopenshell.open(input_ifc)

# # --- STEP 4: Map and metadata ---
# for obj in bpy.data.objects:
#     if "ifc_definition_id" not in obj:
#         continue  # Skip non-IFC objects
#     try:
#         ifc_entity = f.by_id(int(obj["ifc_definition_id"]))
#         gid = ifc_entity.GlobalId
#         data = {
#             "GlobalId": gid,
#             "IfcType": ifc_entity.is_a(),
#             "Name": ifc_entity.Name,
#             "Storey": ifcopenshell.util.element.get_container(ifc_entity, "IfcBuildingStorey"),
#             "Building": ifcopenshell.util.element.get_container(ifc_entity, "IfcBuilding"),
#             "Site": ifcopenshell.util.element.get_container(ifc_entity, "IfcSite"),
#         }
#         try:
#             data["Properties"] = ifcopenshell.util.pset.get_psets(ifc_entity)
#         except Exception:
#             data["Properties"] = {}
#         obj["ifc_metadata"] = data
#     except Exception as e:
#         print(f"Failed metadata for {obj.name}: {e}")

# print("Metadata injected into Blender objects.")

# # --- STEP 5: Export to glTF (no materials, no textures) ---
# print(f"Exporting GLB: {output_gltf}")
# bpy.ops.export_scene.gltf(
#     filepath=output_gltf,
#     export_format='GLB',
#     export_apply=True,
#     export_texcoords=False,
#     export_normals=True,
#     export_yup=True,
#     export_materials='NONE'
# )

# print("Exported GLB successfully.")

import bpy
import sys

# Add BlenderBIM's ifcopenshell to path
sys.path.append('/opt/blender-4.2.3-linux-x64/4.2/scripts/addons/blenderbim/libs/site/packages')

import ifcopenshell
import ifcopenshell.util.element
import ifcopenshell.util.pset

# --- CONFIG ---
input_ifc = "/workspace/NBU_MedicalClinic_Eng-MEP.ifc"
output_gltf = "/workspace/model.glb"

# --- STEP 1: Clean scene ---
bpy.ops.wm.read_factory_settings(use_empty=True)

# --- STEP 2: Enable BlenderBIM ---
bpy.ops.preferences.addon_enable(module="blenderbim")
print("BlenderBIM add-on enabled.")

# --- STEP 3: Import IFC ---
print(f"Importing IFC: {input_ifc}")
bpy.ops.bim.load_project(filepath=input_ifc)

f = ifcopenshell.open(input_ifc)

# --- STEP 4: Add metadata ---
for obj in bpy.data.objects:
    if "ifc_definition_id" not in obj:
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

# --- STEP 5: Export GLB ---
print(f"Exporting GLB: {output_gltf}")
bpy.ops.export_scene.gltf(
    filepath=output_gltf,
    export_format='GLB',
    export_apply=True,
    export_texcoords=False,
    export_normals=True,
    export_yup=True,
    export_materials='NONE'
)

print("Export complete!")

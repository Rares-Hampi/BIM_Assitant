import sys
import os
import json
import subprocess
import ifcopenshell

# --- CONFIG ---
IFC_CONVERT_BIN = "/usr/local/bin/IfcConvert" 
INPUT_IFC = "/workspace/NBU_MedicalClinic_Eng-MEP.ifc"
OUTPUT_DIR = "/workspace/output_web/"

# Classification Logic
KEYWORDS = {
    "ducts": ["duct", "grille", "diffuser", "exhaust", "supply", "return", "damper", "fcu", "fan", "air terminal"],
    "pipes": ["pipe", "water", "sanitary", "sewer", "drain", "waste", "valve", "faucet", "sink", "sprinkler", "pump"],
    "electrical": ["cable", "tray", "wire", "conduit", "switch", "socket", "panel", "lighting", "detector"],
    "walls": ["wall", "curtain", "cladding"],
    "slabs": ["slab", "floor", "roof", "footing"]
}

STRUCTURAL_CLASSES = {
    "walls": ["IfcWall", "IfcWallStandardCase", "IfcCurtainWall"],
    "slabs": ["IfcSlab", "IfcRoof", "IfcFooting"],
    "doors": ["IfcDoor"],
    "windows": ["IfcWindow"]
}

def get_category(element):
    name = (element.Name or "").lower()
    obj_type = (element.ObjectType or "").lower()
    full_text = f"{name} {obj_type}"
    entity_type = element.is_a()

    for cat, words in KEYWORDS.items():
        for word in words:
            if word in full_text:
                return cat

    for cat, classes in STRUCTURAL_CLASSES.items():
        if entity_type in classes:
            return cat
            
    return "others"

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    print(f"[1/4] Analyzing {INPUT_IFC}...")
    model_analysis = ifcopenshell.open(INPUT_IFC)
    
    buckets = {key: [] for key in list(KEYWORDS.keys()) + ["doors", "windows", "others"]}
    metadata_export = {key: {} for key in buckets.keys()}

    products = model_analysis.by_type("IfcProduct")
    
    for product in products:
        if product.is_a("IfcSpatialStructureElement") or product.is_a("IfcOpeningElement"):
            continue
            
        cat = get_category(product)
        buckets[cat].append(product.GlobalId)
        
        metadata_export[cat][product.GlobalId] = {
            "name": product.Name,
            "type": product.is_a(),
            "category": cat
        }
    
    model_analysis = None 

    print("[2/4] Processing Categories...")
    
    for cat, guids in buckets.items():
        if not guids:
            continue
            
        print(f"--- Processing {cat} ({len(guids)} items) ---")
        
        # 1. Save JSON Metadata
        with open(os.path.join(OUTPUT_DIR, f"{cat}.json"), "w") as f:
            json.dump(metadata_export[cat], f, indent=2)

        # 2. Create Temp IFC
        temp_model = ifcopenshell.open(INPUT_IFC)
        all_elements = temp_model.by_type("IfcElement")
        guid_set = set(guids)
        
        for ele in all_elements:
            if ele.GlobalId not in guid_set:
                try:
                    temp_model.remove(ele)
                except:
                    pass
        
        temp_ifc_path = os.path.join(OUTPUT_DIR, f"temp_{cat}.ifc")
        temp_model.write(temp_ifc_path)
        
        # 3. Convert
        output_glb = os.path.join(OUTPUT_DIR, f"{cat}.glb")
        
        cmd = [
            IFC_CONVERT_BIN,
            temp_ifc_path,
            output_glb,
            "--y-up",
            "--verbose"  # <--- FIXED: Changed from --v to --verbose
        ]
        
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)
            print(f"   [OK] Generated {cat}.glb")
        except subprocess.CalledProcessError:
            print(f"   [ERROR] IfcConvert failed for {cat}")
        
        if os.path.exists(temp_ifc_path):
            os.remove(temp_ifc_path)

    print("\n[DONE] Check /workspace/output_web/")

if __name__ == "__main__":
    main()
import sys
import os
import json
import ifcopenshell
import collections

# --- CONFIG ---
INPUT_IFC = "./NBU_MedicalClinic_Eng-MEP.ifc"
OUTPUT_JSON = "./inventory.json"

def main():
    print(f"--- START SCAN: {INPUT_IFC} ---")
    
    if not os.path.exists(INPUT_IFC):
        print(f"[ERROR] Nu găsesc fișierul: {INPUT_IFC}")
        return

    # 1. Încărcăm modelul (doar datele, fără geometrie grea)
    model = ifcopenshell.open(INPUT_IFC)
    
    # 2. Căutăm doar elementele fizice (IfcProduct)
    # IfcProduct este "bunicul" tuturor obiectelor fizice (pereți, țevi, uși)
    # Nu ne interesează definițiile abstracte de stil sau coordonate.
    print("Se colectează elementele fizice...")
    products = model.by_type("IfcProduct")
    
    total_items = len(products)
    print(f"Total elemente fizice găsite: {total_items}")

    # 3. Numărăm pe categorii
    # Folosim un Counter pentru a grupa automat (ex: IfcWall: 50, IfcPipeSegment: 200)
    # counts = collections.Counter([p.is_a() for p in products])
    detailed_types = []
    for p in products:
        entity_type = p.is_a()
        # Încercăm să aflăm ce fel de FlowSegment este
        if entity_type == "IfcFlowSegment":
            # Verificăm dacă are un tip specificat (ex: DUCTSEGMENT, PIPESEGMENT)
            predefined = p.PredefinedType if hasattr(p, "PredefinedType") else "GENERIC"
            detailed_types.append(f"{entity_type} ({predefined})")
        else:
            detailed_types.append(entity_type)

    counts = collections.Counter(detailed_types)
    
    # 4. Pregătim structura pentru Frontend (JSON)
    # Vrem o listă sortată descrescător ca să vedem cele mai frecvente elemente sus
    inventory_list = []
    
    print("\n--- REZULTAT INVENTAR ---")
    for ifc_type, count in counts.most_common():
        print(f"  {ifc_type}: {count}")
        
        inventory_list.append({
            "type": ifc_type,
            "count": count,
            # Putem adăuga aici și o culoare "hardcoded" pentru UI dacă vrei
            "category": "MEP" if "Pipe" in ifc_type or "Duct" in ifc_type else "ARCH/STRUCT"
        })

    # 5. Salvăm JSON-ul
    data = {
        "filename": os.path.basename(INPUT_IFC),
        "total_elements": total_items,
        "breakdown": inventory_list
    }
    
    with open(OUTPUT_JSON, "w") as f:
        json.dump(data, f, indent=2)
        
    print(f"\n[SUCCES] Raport salvat în: {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
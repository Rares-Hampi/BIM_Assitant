import ifcopenshell

# --- CONFIG ---
INPUT_IFC = "./NBU_MedicalClinic_Eng-MEP.ifc"

def main():
    print(f"Încărcăm fișierul pentru inspecție profundă...")
    model = ifcopenshell.open(INPUT_IFC)
    
    # Căutăm toate segmentele
    segments = model.by_type("IfcFlowSegment")
    
    print(f"\n--- EXEMPLE DE DENUMIRI (Primele 20 din {len(segments)}) ---")
    print(f"{'INDEX':<5} | {'NAME (Nume Instanță)':<40} | {'OBJECT TYPE (Nume Familie)'}")
    print("-" * 90)
    
    for i, s in enumerate(segments[:30]):
        # Curățăm textul pentru afișare (uneori e None)
        name = s.Name if s.Name else "---"
        obj_type = s.ObjectType if s.ObjectType else "---"
        
        print(f"{i:<5} | {name[:38]:<40} | {obj_type}")

    print("-" * 90)
    print("Analizează lista de mai sus. Vezi cuvinte cheie precum 'Duct', 'Pipe', 'Cable'?")

if __name__ == "__main__":
    main()
import ifcopenshell
import ifcopenshell.util.selector

model = ifcopenshell.open("model.ifc")
# Get all concrete walls and slabs.
ifcopenshell.util.selector.filter_elements(model, "IfcWall, IfcSlab, material=concrete")
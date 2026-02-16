import React, { useEffect } from 'react'
import { IfcViewerAPI } from 'web-ifc-viewer'
import './Model.css'

const Model = () => {
    useEffect(() => {
        const container = document.getElementById('viewer-container');
        const viewer = new IfcViewerAPI({ container });
        viewer.axes.setAxes();
        viewer.grid.setGrid();

        const input = document.getElementById("file-input");

        const handleFileChange = async (changed: Event) => {
            const target = changed.target as HTMLInputElement;
            const file = target.files?.[0];
            if (file) {
                const ifcURL = URL.createObjectURL(file);
                viewer.IFC.loadIfcUrl(ifcURL);
            }
        };

        input?.addEventListener("change", handleFileChange, false);

        return () => {
            input?.removeEventListener("change", handleFileChange, false);
        };
    }, []);

    return (
        <>
            <input type="file" id="file-input" accept=".ifc, .ifcXML, .ifcZIP" />
            <div id="viewer-container"></div>
        </>
    )
}

export default Model
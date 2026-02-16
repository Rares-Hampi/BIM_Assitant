import React, { useEffect, useRef, useState, useCallback } from 'react'
import { IfcViewerAPI } from 'web-ifc-viewer'
import './Model.css'

// Minimal example component to demonstrate loading an IFC file
// - loads a default model from the public folder on mount
// - allows selecting a local .ifc file via file input
// This file is intentionally self-contained and uses the same CSS as `Model.jsx`.
const ShowIfcExample = () => {
  const viewerRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')

  // helpers placed in component scope so both the effect and file input can use them
  const safeRender = useCallback(() => {
    try {
      const ctx = viewerRef.current?.context
      if (ctx && typeof ctx.render === 'function') return ctx.render()
      if (typeof viewerRef.current?.render === 'function') return viewerRef.current.render()
      if (ctx?.renderer?.renderer && typeof ctx.renderer.renderer.render === 'function') return ctx.renderer.renderer.render(ctx.scene, ctx.camera)
    } catch (err) {
      console.debug('safeRender failed:', err)
    }
  }, [])

  const collectMeshesFromScene = useCallback((node, out) => {
    if (!node || !out) return
    try {
      const realNode = node.scene ? node.scene : node
      if (realNode.isMesh || realNode.type === 'Mesh') out.push(realNode)
      if (Array.isArray(realNode.children) && realNode.children.length) realNode.children.forEach(c => collectMeshesFromScene(c, out))
    } catch (err) { console.debug('collectMeshesFromScene failed', err) }
  }, [])

  const normalizeMeshesAndRender = useCallback((meshes) => {
    if (!Array.isArray(meshes)) return
    meshes.forEach((mesh) => {
      if (!mesh) return
      try {
        mesh.visible = true
      } catch (err) { console.debug('set visible failed', err) }
      try {
        mesh.castShadow = true
        mesh.receiveShadow = true
      } catch (err) { console.debug('set shadow flags failed', err) }
      try {
        const geom = mesh.geometry
        if (geom) {
          if (!geom.boundingBox && typeof geom.computeBoundingBox === 'function') geom.computeBoundingBox()
          if (typeof geom.computeVertexNormals === 'function') geom.computeVertexNormals()
        }
        const mat = mesh.material
        if (mat && typeof mat === 'object') {
          if (typeof mat.side !== 'undefined') mat.side = 2
          mat.transparent = false
          mat.opacity = 1
          mat.depthWrite = true
          mat.needsUpdate = true
        }
      } catch (err) { console.debug('mesh normalize failed', err) }
    })
    safeRender()
  }, [safeRender])

  const fitToScene = useCallback((meshCandidates) => {
    try {
      if (typeof viewerRef.current?.fitToFrame === 'function') {
        try { viewerRef.current.fitToFrame() } catch (e) { console.debug('fitToFrame failed', e) }
        return
      }
      // fallback: compute a center from provided candidates or scene
      const meshes = Array.isArray(meshCandidates) && meshCandidates.length ? meshCandidates.slice() : []
      const ctx = viewerRef.current?.context
      if (!meshes.length && ctx?.scene) collectMeshesFromScene(ctx.scene, meshes)
      if (!meshes.length && Array.isArray(ctx?.items) && ctx.items.length) ctx.items.forEach(i => collectMeshesFromScene(i, meshes))
      if (!meshes.length) {
        const ifcRoot = viewerRef.current?.IFC
        if (ifcRoot && Array.isArray(ifcRoot.models) && ifcRoot.models.length) ifcRoot.models.forEach(m => collectMeshesFromScene(m, meshes))
      }
      if (!meshes.length) return
      const mesh = meshes[0]
      let center = { x: 0, y: 0, z: 0 }
      let sizeZ = 1
      try {
        if (mesh.position && typeof mesh.position.x === 'number') {
          center = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
          sizeZ = mesh.scale?.z ? Math.abs(mesh.scale.z) : 1
        } else if (mesh.geometry) {
          const geom = mesh.geometry
          if (!geom.boundingBox && typeof geom.computeBoundingBox === 'function') geom.computeBoundingBox()
          const bb = geom.boundingBox
          if (bb && bb.min && bb.max) {
            center = { x: (bb.min.x + bb.max.x) / 2, y: (bb.min.y + bb.max.y) / 2, z: (bb.min.z + bb.max.z) / 2 }
            sizeZ = Math.abs(bb.max.z - bb.min.z) || 1
          }
        }
      } catch (err) { console.debug('fitToScene center calc failed', err) }

      const cam = viewerRef.current?.context?.camera
      if (cam) {
        try {
          const verticalOffset = Math.max(1, sizeZ * 0.5)
          cam.position.set(center.x, center.y + verticalOffset, center.z + Math.max(1, sizeZ * 2))
          cam.lookAt(center.x, center.y, center.z)
        } catch (err) { console.debug('camera positioning failed', err) }
      }
      safeRender()
    } catch (err) { console.debug('fitToScene failed', err) }
  }, [collectMeshesFromScene, safeRender])

  const loadIfcUrl = useCallback(async (url, prettyName) => {
    setLoading(true)
    setFileName(prettyName || url)
    try {
      const res = await viewerRef.current.IFC.loadIfcUrl(url)
      const meshes = []
      if (res) {
        if (res.isMesh || res.type === 'Mesh') meshes.push(res)
        if (Array.isArray(res.children) && res.children.length) meshes.push(...res.children.filter(c => c && (c.isMesh || c.type === 'Mesh')))
      }
      if (viewerRef.current?.context?.scene) collectMeshesFromScene(viewerRef.current.context.scene, meshes)
      normalizeMeshesAndRender(meshes)
      fitToScene(meshes)
    } catch (err) {
      console.error('Failed loading IFC:', err)
      setFileName('Failed to load')
    } finally {
      setLoading(false)
    }
  }, [collectMeshesFromScene, normalizeMeshesAndRender, fitToScene])

  // We intentionally want this effect to run only once on mount to initialize the viewer
  useEffect(() => {
    const container = document.getElementById('viewer-container')
    const viewer = new IfcViewerAPI({ container })
    viewerRef.current = viewer

    // wasm files are located under /public/wasm in this project
    viewer.setWasmPath('/wasm/')
    viewer.axes.setAxes()
    viewer.grid.setGrid()

  // load a default example from the public folder using our helper
  setTimeout(() => { loadIfcUrl('/BasicHouse.ifc', 'BasicHouse.ifc') }, 100)

    return () => {
      // cleanup viewer reference
      viewerRef.current = null
    }
  }, [loadIfcUrl])

  const onFileChange = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setLoading(true)
    setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      // load from memory buffer
      const model = await viewerRef.current.IFC.loadIfc(buffer, { webIfc: { useLegacyIfc: false } })
      console.log('Loaded model from file input:', model)
      // try to collect and normalize meshes
      const meshes = []
      if (model) {
        if (model.isMesh || model.type === 'Mesh') meshes.push(model)
        if (Array.isArray(model.children) && model.children.length) meshes.push(...model.children.filter(c => c && (c.isMesh || c.type === 'Mesh')))
      }
      if (viewerRef.current?.context?.scene) collectMeshesFromScene(viewerRef.current.context.scene, meshes)
      normalizeMeshesAndRender(meshes)
      if (typeof viewerRef.current.fitToFrame === 'function') viewerRef.current.fitToFrame()
    } catch (err) {
      console.error('Error loading file input:', err)
      setFileName('Failed to load')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div style={{ position: 'absolute', zIndex: 5, left: 12, top: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ background: '#fff', padding: '6px 8px', borderRadius: 6, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
          Choose IFC
          <input type="file" accept=".ifc" onChange={onFileChange} style={{ display: 'none' }} />
        </label>
        <div style={{ background: 'rgba(255,255,255,0.9)', padding: '6px 8px', borderRadius: 6 }}>
          {loading ? <span>Loading {fileName || '...'}</span> : fileName ? <span>Loaded: {fileName}</span> : <span>Ready</span>}
        </div>
      </div>

      <div id="viewer-container" style={{ width: '100vw', height: '100vh' }}></div>
    </div>
  )
}

export default ShowIfcExample

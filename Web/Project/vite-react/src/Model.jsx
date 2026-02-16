import React, { useEffect, useRef, useState } from 'react'
import { IfcViewerAPI } from 'web-ifc-viewer'
import './Model.css'

const Model = () => {
  const viewerRef = useRef(null)
  // keep setters only to avoid unused variable lint errors since UI for these is commented out
  const [, setLoading] = useState(false)
  const [, setFileName] = useState('')

  useEffect(() => {
    const container = document.getElementById('viewer-container')
    const viewer = new IfcViewerAPI({ container })
    viewerRef.current = viewer

    viewer.setWasmPath('/wasm/')
    viewer.axes.setAxes()
    viewer.grid.setGrid()

    const safeRender = () => {
      try {
        const ctx = viewerRef.current?.context
        if (ctx && typeof ctx.render === 'function') {
          ctx.render()
          return
        }
        if (typeof viewerRef.current?.render === 'function') {
          viewerRef.current.render()
          return
        }
        if (ctx?.renderer?.renderer && typeof ctx.renderer.renderer.render === 'function') {
          ctx.renderer.renderer.render(ctx.scene, ctx.camera)
          return
        }
      } catch (err) {
        console.warn('safeRender failed with error:', err)
      }
    }

    const collectMeshesFromScene = (node, out) => {
      if (!node || !out) return
      try {
        const realNode = node.scene ? node.scene : node
        if (realNode.isMesh || realNode.type === 'Mesh') out.push(realNode)
        if (Array.isArray(realNode.children) && realNode.children.length) realNode.children.forEach(c => collectMeshesFromScene(c, out))
      } catch (err) {
        console.debug('collectMeshesFromScene per-node failed', err)
      }
    }

    const normalizeAndInspectMeshes = (meshes) => {
      if (!Array.isArray(meshes)) return
      meshes.forEach((mesh, idx) => {
        try {
          if (!mesh) return
          mesh.visible = true
          const geom = mesh.geometry
          if (geom) {
            try { if (!geom.boundingBox && typeof geom.computeBoundingBox === 'function') geom.computeBoundingBox() } catch (err) { console.debug('computeBoundingBox failed', err) }
            try { if (typeof geom.computeVertexNormals === 'function') geom.computeVertexNormals() } catch (err) { console.debug('computeVertexNormals failed', err) }
            const posCount = geom.attributes?.position?.count ?? 0
            const idxCount = geom.index?.count ?? 0
            console.log(`Mesh[${idx}] geometry: positionCount=${posCount}, indexCount=${idxCount}, hasBoundingBox=${!!geom.boundingBox}`)
          }
          const mat = mesh.material
          if (mat && typeof mat === 'object') {
            try {
              if (typeof mat.side !== 'undefined') mat.side = 2
              mat.transparent = false
              mat.opacity = 1
              mat.depthWrite = true
              mat.needsUpdate = true
            } catch (err) { console.debug('per-mesh inspect failed', err) }
          }
          try { mesh.castShadow = true; mesh.receiveShadow = true } catch (err) { console.debug('set shadow flags failed', err) }
        } catch {
          /* ignore per-mesh */
        }
      })
      safeRender()
    }

    const fitToMeshes = (meshCandidates) => {
      if (!meshCandidates || meshCandidates.length === 0) {
        meshCandidates = meshCandidates || []
        const ctx = viewerRef.current?.context
        if (ctx?.scene) collectMeshesFromScene(ctx.scene, meshCandidates)
        if (Array.isArray(ctx?.items) && ctx.items.length) ctx.items.forEach(i => collectMeshesFromScene(i, meshCandidates))
        const ifcRoot = viewerRef.current?.IFC
        if (ifcRoot && Array.isArray(ifcRoot.models) && ifcRoot.models.length) ifcRoot.models.forEach(m => collectMeshesFromScene(m, meshCandidates))
        if (!meshCandidates.length) return false
      }
      try {
        const mesh = meshCandidates[0]
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
        } catch {
          /* ignore per-mesh errors */
        }
        const cam = viewerRef.current?.context?.camera
        const sceneObj = viewerRef.current?.context?.scene
        if (cam) {
          try {
            const verticalOffset = Math.max(1, sizeZ * 0.5)
            cam.position.set(center.x, center.y + verticalOffset, center.z + Math.max(1, sizeZ * 2))
            cam.lookAt(center.x, center.y, center.z)
          } catch {
            try { cam.position.z = center.z + Math.max(1, sizeZ * 2) } catch { /* ignore */ }
          }
        }
        if (sceneObj) safeRender()
        return true
      } catch (err) {
        console.warn('fitToMeshes failed:', err)
        return false
      }
    }

    const loadFromUrl = async (url, prettyName) => {
      setLoading(true)
      setFileName(prettyName || url)
      try {
        const res = await viewerRef.current.IFC.loadIfcUrl(url)
        console.log('IFC load result (url):', res)
        const meshes = []
        const scene = viewerRef.current?.context?.scene
        if (res) {
          if (res.isMesh || res.type === 'Mesh') meshes.push(res)
          if (Array.isArray(res.children) && res.children.length) meshes.push(...res.children.filter(c => c && (c.isMesh || c.type === 'Mesh')))
        }
        if (scene) collectMeshesFromScene(scene, meshes)
        console.log('Total mesh candidates found:', meshes.length)
        normalizeAndInspectMeshes(meshes)
        if (typeof viewerRef.current.fitToFrame === 'function') {
          try { viewerRef.current.fitToFrame() } catch (e) { console.warn('fitToFrame error:', e) }
        } else {
          fitToMeshes(meshes)
        }
      } catch (err) {
        console.error('Failed to load IFC from url', url, err)
        setFileName('Failed to load file')
      } finally {
        setLoading(false)
      }
    }

    try {
      setTimeout(() => {
        if (typeof loadFromUrl === 'function') loadFromUrl('/BasicHouse.ifc', 'BasicHouse.ifc')
      }, 200)
    } catch {
      /* ignore */
    }

    return () => {
      viewerRef.current = null
    }
  }, [])

  return (
    <>
      {/* <div className="controls">
        <div style={{ marginLeft: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div>
            {loading ? <span>Loading {fileName || '...'}</span> : fileName ? <span>Loaded: {fileName}</span> : <span>Loading model...</span>}
          </div>
        </div>
      </div> */}
      <div id="viewer-container"></div>
    </>
  )
}

export default Model
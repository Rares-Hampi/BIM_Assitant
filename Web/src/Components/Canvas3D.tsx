import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './Canvas3D.css';

interface Canvas3DProps {
    modelVisibility: Record<string, boolean>;
}

export interface Canvas3DHandle {
    resetView: () => void;
}

interface ModelInfo {
    name: string;
    fileName: string;
    color: string;
    group: THREE.Group | null;
}

const Canvas3D = forwardRef<Canvas3DHandle, Canvas3DProps>(({ modelVisibility }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const modelsRef = useRef<ModelInfo[]>([
        { name: 'structural', fileName: 'others.glb', color: '#808080', group: null },
        { name: 'walls', fileName: 'walls.glb', color: '#000000', group: null },
        { name: 'ducts', fileName: 'ducts.glb', color: '#A9A9A9', group: null },
        { name: 'electrical', fileName: 'electrical.glb', color: '#FFD700', group: null },
        { name: 'pipes', fileName: 'pipes.glb', color: '#0000FF', group: null },
    ]);

    useEffect(() => {
        if (!containerRef.current) return;

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x5a6472);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
            60,
            containerRef.current.clientWidth / containerRef.current.clientHeight,
            0.1,
            1000
        );
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        renderer.shadowMap.enabled = true;
        containerRef.current.appendChild(renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        scene.add(hemisphereLight);

        // OrbitControls
        const controls = new OrbitControls(camera, renderer.domElement);
        controlsRef.current = controls;
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = false;
        controls.minDistance = 5;
        controls.maxDistance = 50;
        controls.maxPolarAngle = Math.PI / 2;

        // Load models
        const loader = new GLTFLoader();
        let modelsLoaded = 0;
        const totalModels = modelsRef.current.length;

        modelsRef.current.forEach((modelInfo, index) => {
            const modelPath = `/output_web/${modelInfo.fileName}`;
            
            loader.load(
                modelPath,
                (gltf) => {
                    const model = gltf.scene;
                    
                    // Apply color to the model
                    model.traverse((child) => {
                        if ((child as THREE.Mesh).isMesh) {
                            const mesh = child as THREE.Mesh;
                            mesh.castShadow = true;
                            mesh.receiveShadow = true;
                            
                            // Create a new material with the specified color
                            const material = new THREE.MeshStandardMaterial({
                                color: new THREE.Color(modelInfo.color),
                                metalness: 0.3,
                                roughness: 0.7,
                            });
                            mesh.material = material;
                        }
                    });

                    scene.add(model);
                    modelsRef.current[index].group = model;
                    modelsLoaded++;

                    // After all models are loaded, center the camera
                    if (modelsLoaded === totalModels) {
                        const combinedBox = new THREE.Box3();
                        modelsRef.current.forEach(m => {
                            if (m.group) {
                                const box = new THREE.Box3().setFromObject(m.group);
                                combinedBox.union(box);
                            }
                        });

                        const center = combinedBox.getCenter(new THREE.Vector3());
                        const size = combinedBox.getSize(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const fov = camera.fov * (Math.PI / 180);
                        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                        cameraZ *= 1.5; // Add some padding

                        camera.position.set(center.x + cameraZ * 0.5, center.y + cameraZ * 0.5, center.z + cameraZ);
                        controls.target.copy(center);
                        controls.update();
                    }
                },
                undefined,
                (error) => {
                    console.error(`Error loading ${modelInfo.name}:`, error);
                    modelsLoaded++;
                }
            );
        });

        // Animation loop
        const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Handle resize
        const handleResize = () => {
            if (!containerRef.current) return;
            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight;
            
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };
        window.addEventListener('resize', handleResize);

        // Cleanup
        const currentContainer = containerRef.current;
        return () => {
            window.removeEventListener('resize', handleResize);
            if (currentContainer && renderer.domElement) {
                currentContainer.removeChild(renderer.domElement);
            }
            renderer.dispose();
        };
    }, []);

    // Update model visibility
    useEffect(() => {
        modelsRef.current.forEach((modelInfo) => {
            if (modelInfo.group) {
                modelInfo.group.visible = modelVisibility[modelInfo.name] !== false;
            }
        });
    }, [modelVisibility]);

    // Expose resetView method to parent
    useImperativeHandle(ref, () => ({
        resetView: () => {
            const combinedBox = new THREE.Box3();
            modelsRef.current.forEach(m => {
                if (m.group && m.group.visible) {
                    const box = new THREE.Box3().setFromObject(m.group);
                    combinedBox.union(box);
                }
            });

            if (cameraRef.current && controlsRef.current) {
                const center = combinedBox.getCenter(new THREE.Vector3());
                const size = combinedBox.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const fov = cameraRef.current.fov * (Math.PI / 180);
                let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                cameraZ *= 1.5;

                cameraRef.current.position.set(center.x + cameraZ * 0.5, center.y + cameraZ * 0.5, center.z + cameraZ);
                controlsRef.current.target.copy(center);
                controlsRef.current.update();
            }
        }
    }));

    return (
        <div className="canvas-container">
            <div ref={containerRef} className="canvas-3d" />
        </div>
    );
});

Canvas3D.displayName = 'Canvas3D';

export default Canvas3D;

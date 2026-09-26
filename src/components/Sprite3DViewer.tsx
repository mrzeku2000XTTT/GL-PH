import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  RotateCcw,
  Maximize2,
  Minimize2,
  Compass,
  Sun,
  Layers,
  Camera,
  Play,
  Pause,
  Repeat,
  Sparkles,
  Download
} from 'lucide-react';
import { MotionPreset, TreatmentEffect } from '../services/spriteMotionEngine';

export interface Sprite3DViewerProps {
  sourceCanvas: HTMLCanvasElement | null;
  preset: MotionPreset;
  speed: number;
  intensity: number;
  treatment: TreatmentEffect;
  treatmentColor: string;
  onBake3DAngleFrames?: (getFrameCanvas: (frameIndex: number, totalFrames: number) => HTMLCanvasElement) => void;
}

export const Sprite3DViewer: React.FC<Sprite3DViewerProps> = ({
  sourceCanvas,
  preset,
  speed,
  intensity,
  treatment,
  treatmentColor,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // 3D Model Hierarchy References
  const creatureRootRef = useRef<THREE.Group | null>(null);
  const bodyMeshRef = useRef<THREE.Mesh | null>(null);
  const leftWingPivotRef = useRef<THREE.Group | null>(null);
  const rightWingPivotRef = useRef<THREE.Group | null>(null);
  const leftWingMeshRef = useRef<THREE.Mesh | null>(null);
  const rightWingMeshRef = useRef<THREE.Mesh | null>(null);

  // Lighting references
  const keyLightRef = useRef<THREE.PointLight | null>(null);
  const rimLightRef = useRef<THREE.PointLight | null>(null);

  // Playback & Angle Camera state
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<'isometric' | 'front' | 'side' | 'top' | 'rear' | 'custom'>('isometric');
  const [yawAngle, setYawAngle] = useState<number>(35); // degrees
  const [pitchAngle, setPitchAngle] = useState<number>(25); // degrees
  const [cameraDistance, setCameraDistance] = useState<number>(5.5);
  const [wingDihedralMax, setWingDihedralMax] = useState<number>(65); // degrees
  const [depthExtrusion, setDepthExtrusion] = useState<number>(0.15); // 3D thickness
  const [orthographicView, setOrthographicView] = useState<boolean>(false);
  const [showShadowGround, setShowShadowGround] = useState<boolean>(true);

  // Drag orbit tracking
  const isDraggingRef = useRef<boolean>(false);
  const previousMousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 450;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, cameraDistance);
    cameraRef.current = camera;

    // 3. Renderer with high DPI & Alpha transparency
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.PointLight(0x1ff2e1, 3.5, 20);
    keyLight.position.set(3, 4, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const rimLight = new THREE.PointLight(0x9c5fef, 4.0, 20);
    rimLight.position.set(-3, -2, -3);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    // 5. Ground shadow receiver plane
    const shadowGeo = new THREE.PlaneGeometry(8, 8);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const groundMesh = new THREE.Mesh(shadowGeo, shadowMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -2.2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // 6. Build the 3D creature hierarchy
    rebuild3DModel();

    // 7. Handle Resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.dispose();
    };
  }, []);

  // Rebuild 3D Model whenever sourceCanvas, depthExtrusion or treatment changes
  useEffect(() => {
    rebuild3DModel();
  }, [sourceCanvas, depthExtrusion, treatment, treatmentColor]);

  const rebuild3DModel = () => {
    const scene = sceneRef.current;
    if (!scene || !sourceCanvas) return;

    // Clean up previous creature root
    if (creatureRootRef.current) {
      scene.remove(creatureRootRef.current);
      creatureRootRef.current = null;
    }

    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    // Segment the source canvas into textures:
    // Left Wing (x: 0 to 42% width)
    // Body / Thorax (x: 38% to 62% width)
    // Right Wing (x: 58% to 100% width)
    const bodyW = w * 0.24;
    const wingW = w * 0.42;

    const leftWingCanvas = document.createElement('canvas');
    leftWingCanvas.width = wingW;
    leftWingCanvas.height = h;
    const lwCtx = leftWingCanvas.getContext('2d');
    lwCtx?.drawImage(sourceCanvas, 0, 0, wingW, h, 0, 0, wingW, h);

    const bodyCanvas = document.createElement('canvas');
    bodyCanvas.width = bodyW;
    bodyCanvas.height = h;
    const bCtx = bodyCanvas.getContext('2d');
    bCtx?.drawImage(sourceCanvas, (w - bodyW) / 2, 0, bodyW, h, 0, 0, bodyW, h);

    const rightWingCanvas = document.createElement('canvas');
    rightWingCanvas.width = wingW;
    rightWingCanvas.height = h;
    const rwCtx = rightWingCanvas.getContext('2d');
    rwCtx?.drawImage(sourceCanvas, w - wingW, 0, wingW, h, 0, 0, wingW, h);

    // Three.js Textures
    const leftTex = new THREE.CanvasTexture(leftWingCanvas);
    leftTex.colorSpace = THREE.SRGBColorSpace;

    const bodyTex = new THREE.CanvasTexture(bodyCanvas);
    bodyTex.colorSpace = THREE.SRGBColorSpace;

    const rightTex = new THREE.CanvasTexture(rightWingCanvas);
    rightTex.colorSpace = THREE.SRGBColorSpace;

    const creatureGroup = new THREE.Group();
    creatureRootRef.current = creatureGroup;
    scene.add(creatureGroup);

    // Standard units: 3.0 height
    const unitH = 3.0;
    const unitBodyW = (bodyW / h) * unitH;
    const unitWingW = (wingW / h) * unitH;

    // 1. Central Body Mesh (with volumetric 3D box extrusion)
    const bodyGeo = new THREE.BoxGeometry(unitBodyW, unitH, Math.max(0.04, depthExtrusion * 1.5));
    const bodyMat = new THREE.MeshStandardMaterial({
      map: bodyTex,
      transparent: true,
      roughness: 0.35,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    creatureGroup.add(bodyMesh);
    bodyMeshRef.current = bodyMesh;

    // 2. Left Wing Pivot (placed at body left edge)
    const leftPivot = new THREE.Group();
    leftPivot.position.set(-unitBodyW * 0.45, 0, 0);
    creatureGroup.add(leftPivot);
    leftWingPivotRef.current = leftPivot;

    const wingGeo = new THREE.BoxGeometry(unitWingW, unitH, Math.max(0.02, depthExtrusion * 0.5));
    // Shift geometry so pivot is at wing root
    wingGeo.translate(-unitWingW / 2, 0, 0);

    const leftWingMat = new THREE.MeshStandardMaterial({
      map: leftTex,
      transparent: true,
      roughness: 0.25,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    const leftWingMesh = new THREE.Mesh(wingGeo, leftWingMat);
    leftWingMesh.castShadow = true;
    leftWingMesh.receiveShadow = true;
    leftPivot.add(leftWingMesh);
    leftWingMeshRef.current = leftWingMesh;

    // 3. Right Wing Pivot (placed at body right edge)
    const rightPivot = new THREE.Group();
    rightPivot.position.set(unitBodyW * 0.45, 0, 0);
    creatureGroup.add(rightPivot);
    rightWingPivotRef.current = rightPivot;

    const rightWingGeo = new THREE.BoxGeometry(unitWingW, unitH, Math.max(0.02, depthExtrusion * 0.5));
    rightWingGeo.translate(unitWingW / 2, 0, 0);

    const rightWingMat = new THREE.MeshStandardMaterial({
      map: rightTex,
      transparent: true,
      roughness: 0.25,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    const rightWingMesh = new THREE.Mesh(rightWingGeo, rightWingMat);
    rightWingMesh.castShadow = true;
    rightWingMesh.receiveShadow = true;
    rightPivot.add(rightWingMesh);
    rightWingMeshRef.current = rightWingMesh;
  };

  // Update Camera Orbit based on Yaw, Pitch and Distance
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    const radYaw = (yawAngle * Math.PI) / 180;
    const radPitch = (pitchAngle * Math.PI) / 180;

    const cosPitch = Math.cos(radPitch);
    const sinPitch = Math.sin(radPitch);
    const cosYaw = Math.cos(radYaw);
    const sinYaw = Math.sin(radYaw);

    const x = cameraDistance * cosPitch * sinYaw;
    const y = cameraDistance * sinPitch;
    const z = cameraDistance * cosPitch * cosYaw;

    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  }, [yawAngle, pitchAngle, cameraDistance]);

  // Main 3D Render & Kinematics Loop
  useEffect(() => {
    let startTime = performance.now();

    const animate = (time: number) => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const elapsedSec = (time - startTime) / 1000;
      const rate = speed * (isPlaying ? 1.0 : 0.0);
      const phase = elapsedSec * rate * 4.5;

      // Auto-turntable rotation if enabled
      if (autoRotate && isPlaying) {
        setYawAngle((prev) => (prev + 0.45) % 360);
      }

      // Kinematic 3D Articulation
      const leftPivot = leftWingPivotRef.current;
      const rightPivot = rightWingPivotRef.current;
      const bodyMesh = bodyMeshRef.current;

      if (leftPivot && rightPivot && bodyMesh) {
        const radMaxDihedral = (wingDihedralMax * Math.PI) / 180 * intensity;

        switch (preset) {
          case 'wing_flap':
          case 'fly': {
            // True 3D Dihedral Angle Stroke:
            // Sweep around Y-axis (dihedral up/down), with pitch rotation around X, and camber Z
            const strokeY = Math.sin(phase) * radMaxDihedral;
            const pitchX = -Math.cos(phase) * 0.18 * intensity;
            const camberZ = Math.sin(phase) * 0.08 * intensity;

            leftPivot.rotation.set(pitchX, strokeY, camberZ);
            rightPivot.rotation.set(pitchX, -strokeY, -camberZ);

            // Counter hover on body
            bodyMesh.position.y = -Math.sin(phase) * 0.15 * intensity;
            bodyMesh.rotation.z = Math.sin(phase * 1.5) * 0.03 * intensity;
            break;
          }

          case 'idle':
          case 'breathing': {
            const breath = Math.sin(phase * 0.5);
            const wingRest = Math.sin(phase * 0.5) * 0.12 * intensity;
            leftPivot.rotation.set(0, wingRest, 0);
            rightPivot.rotation.set(0, -wingRest, 0);

            bodyMesh.position.y = breath * 0.06 * intensity;
            bodyMesh.scale.set(1 + breath * 0.02, 1 + breath * 0.02, 1 + breath * 0.02);
            break;
          }

          case 'hover':
          case 'float': {
            const flap = Math.sin(phase * 1.8) * (radMaxDihedral * 0.5);
            leftPivot.rotation.set(0, flap, 0);
            rightPivot.rotation.set(0, -flap, 0);

            bodyMesh.position.y = Math.sin(phase) * 0.25 * intensity;
            bodyMesh.position.x = Math.cos(phase * 0.5) * 0.15 * intensity;
            bodyMesh.rotation.z = Math.cos(phase * 0.5) * 0.08 * intensity;
            break;
          }

          case 'bounce': {
            const bounceY = Math.abs(Math.sin(phase)) * 0.6 * intensity;
            bodyMesh.position.y = bounceY - 0.2;
            const squash = Math.sin(phase) < 0.2 ? 0.85 : 1.05;
            bodyMesh.scale.set(1 / squash, squash, 1 / squash);
            break;
          }

          case 'spin':
          case 'turn': {
            creatureRootRef.current?.rotateY(0.04 * speed * intensity);
            const flap = Math.sin(phase) * 0.2;
            leftPivot.rotation.y = flap;
            rightPivot.rotation.y = -flap;
            break;
          }

          default: {
            const strokeY = Math.sin(phase) * radMaxDihedral * 0.6;
            leftPivot.rotation.y = strokeY;
            rightPivot.rotation.y = -strokeY;
            bodyMesh.position.y = Math.sin(phase) * 0.1;
            break;
          }
        }
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [preset, speed, intensity, isPlaying, autoRotate, wingDihedralMax]);

  // Pointer drag to orbit 3D camera
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    setCameraPreset('custom');
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

    setYawAngle((prev) => (prev + deltaX * 0.5 + 360) % 360);
    setPitchAngle((prev) => Math.max(-80, Math.min(80, prev - deltaY * 0.5)));
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  // Camera preset selectors
  const applyPreset = (presetKey: 'isometric' | 'front' | 'side' | 'top' | 'rear') => {
    setCameraPreset(presetKey);
    switch (presetKey) {
      case 'front':
        setYawAngle(0);
        setPitchAngle(0);
        break;
      case 'isometric':
        setYawAngle(45);
        setPitchAngle(30);
        break;
      case 'side':
        setYawAngle(90);
        setPitchAngle(0);
        break;
      case 'top':
        setYawAngle(0);
        setPitchAngle(85);
        break;
      case 'rear':
        setYawAngle(145);
        setPitchAngle(20);
        break;
    }
  };

  // Snapshot current 3D perspective to PNG
  const snapshot3DFrame = () => {
    if (!rendererRef.current) return;
    const link = document.createElement('a');
    link.download = `butterfly_3d_angle_${Math.round(yawAngle)}deg.png`;
    link.href = rendererRef.current.domElement.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row bg-[#070707] text-[#ececec] overflow-hidden select-none">
      {/* 3D Viewport Area */}
      <div className="flex-1 flex flex-col relative min-h-[460px] bg-[#050505] overflow-hidden border-b lg:border-b-0 lg:border-r border-[#1e1e1e]">
        {/* Top Floating Overlay Controls */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          {/* Angle Preset Quick Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#0e0e0e]/80 backdrop-blur-md border border-[#222] pointer-events-auto">
            <span className="text-[10px] font-mono text-[#5d5d5d] px-1.5 flex items-center gap-1">
              <Compass size={11} className="text-[#1ff2e1]" />
              <span className="hidden sm:inline">ANGLE:</span>
            </span>

            {[
              { id: 'isometric', label: '3/4 Iso' },
              { id: 'front', label: 'Front 0°' },
              { id: 'side', label: 'Side 90°' },
              { id: 'top', label: 'Top 90°' },
              { id: 'rear', label: 'Back 145°' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => applyPreset(item.id as any)}
                className={`px-2 py-1 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                  cameraPreset === item.id
                    ? 'bg-[#1ff2e1] text-black font-semibold'
                    : 'text-[#9b9b9b] hover:text-[#ececec] hover:bg-[#1a1a1a]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Action Snapshot & Turntable */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
                autoRotate
                  ? 'bg-[#1a1a1a] border-[#1ff2e1] text-[#1ff2e1]'
                  : 'bg-[#0e0e0e]/80 border-[#222] text-[#9b9b9b] hover:text-[#ececec]'
              }`}
            >
              <RotateCcw size={12} className={autoRotate ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Turntable</span>
            </button>

            <button
              onClick={snapshot3DFrame}
              className="px-3 py-1.5 rounded-lg bg-[#1ff2e1] text-black font-semibold text-xs flex items-center gap-1.5 shadow-[0_0_14px_rgba(31,242,225,0.4)] cursor-pointer"
            >
              <Camera size={13} />
              <span className="hidden sm:inline">Bake 3D Angle</span>
            </button>
          </div>
        </div>

        {/* 3D WebGL Canvas Container with Drag Orbit */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="flex-1 w-full h-full cursor-grab active:cursor-grabbing relative"
          style={{ touchAction: 'none' }}
        />

        {/* Bottom Floating Playback & Angle Stats Bar */}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto bg-[#0e0e0e]/80 backdrop-blur-md p-1.5 rounded-xl border border-[#222]">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-7 h-7 rounded-lg bg-[#ececec] text-black flex items-center justify-center cursor-pointer"
            >
              {isPlaying ? <Pause size={13} className="fill-black" /> : <Play size={13} className="fill-black" />}
            </button>

            <span className="text-[11px] font-mono text-[#1ff2e1] px-2">
              Yaw: {Math.round(yawAngle)}° · Pitch: {Math.round(pitchAngle)}°
            </span>
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto bg-[#0e0e0e]/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#222] text-[10px] font-mono text-[#9b9b9b]">
            <span className="text-[#1ff2e1]">DRAG TO ORBIT</span>
            <span>· SCROLL / SLIDER TO ZOOM</span>
          </div>
        </div>
      </div>

      {/* 3D Camera & Kinematic Controls Sidebar */}
      <div className="w-full lg:w-[380px] bg-[#0a0a0a] border-t lg:border-t-0 p-5 space-y-6 text-xs overflow-y-auto">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#ececec] flex items-center gap-2">
            <Compass size={14} className="text-[#1ff2e1]" />
            <span>3D Angle & Articulation</span>
          </h3>
          <p className="text-[11px] text-[#9b9b9b] mt-0.5">
            Full 360° orbital perspective with real volumetric dihedral wing flapping.
          </p>
        </div>

        {/* 1. Camera Yaw (Rotation around Y-axis) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b]">
              Horizontal View Yaw
            </label>
            <span className="font-mono text-[#ececec]">{Math.round(yawAngle)}°</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            value={yawAngle}
            onChange={(e) => {
              setYawAngle(parseInt(e.target.value, 10));
              setCameraPreset('custom');
            }}
            className="w-full accent-[#1ff2e1] cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-[#5d5d5d]">
            <span>0° (Front)</span>
            <span>90° (Right)</span>
            <span>180° (Back)</span>
            <span>270° (Left)</span>
          </div>
        </div>

        {/* 2. Camera Pitch (Tilt Elevation) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b]">
              Vertical Elevation Pitch
            </label>
            <span className="font-mono text-[#ececec]">{Math.round(pitchAngle)}°</span>
          </div>
          <input
            type="range"
            min="-60"
            max="85"
            value={pitchAngle}
            onChange={(e) => {
              setPitchAngle(parseInt(e.target.value, 10));
              setCameraPreset('custom');
            }}
            className="w-full accent-[#1ff2e1] cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-[#5d5d5d]">
            <span>-60° (Under)</span>
            <span>0° (Eye Level)</span>
            <span>45° (Isometric)</span>
            <span>85° (Top-Down)</span>
          </div>
        </div>

        {/* 3. Camera Distance / Zoom */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b]">
              Camera Distance
            </label>
            <span className="font-mono text-[#ececec]">{cameraDistance.toFixed(1)} units</span>
          </div>
          <input
            type="range"
            min="3.0"
            max="10.0"
            step="0.2"
            value={cameraDistance}
            onChange={(e) => setCameraDistance(parseFloat(e.target.value))}
            className="w-full accent-[#1ff2e1] cursor-pointer"
          />
        </div>

        {/* 4. 3D Dihedral Flap Amplitude */}
        <div className="space-y-1.5 pt-2 border-t border-[#1e1e1e]">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b]">
              3D Dihedral Flap Sweep
            </label>
            <span className="font-mono text-[#1ff2e1]">±{wingDihedralMax}°</span>
          </div>
          <input
            type="range"
            min="15"
            max="90"
            value={wingDihedralMax}
            onChange={(e) => setWingDihedralMax(parseInt(e.target.value, 10))}
            className="w-full accent-[#1ff2e1] cursor-pointer"
          />
          <span className="text-[10px] text-[#5d5d5d]">
            Controls the true spatial vertical arc sweep of the wings in 3D space.
          </span>
        </div>

        {/* 5. 3D Depth & Thickness Extrusion */}
        <div className="space-y-1.5 pt-2 border-t border-[#1e1e1e]">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b]">
              Extrusion Depth (3D Relief)
            </label>
            <span className="font-mono text-[#ececec]">{depthExtrusion.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0.02"
            max="0.45"
            step="0.02"
            value={depthExtrusion}
            onChange={(e) => setDepthExtrusion(parseFloat(e.target.value))}
            className="w-full accent-[#1ff2e1] cursor-pointer"
          />
          <span className="text-[10px] text-[#5d5d5d]">
            Extrudes the 2D character into tactile 3D relief blocks with cast shadows.
          </span>
        </div>

        {/* 3D Features Summary Badge */}
        <div className="p-3.5 rounded-lg bg-[#141414] border border-[#222] font-mono text-[10px] text-[#9b9b9b] space-y-1.5">
          <div className="text-[#1ff2e1] font-semibold flex items-center gap-1.5">
            <Sparkles size={12} />
            <span>3D Engine Capabilities</span>
          </div>
          <div>• Multi-Planar Joint Rigging (Body, Left & Right Wing)</div>
          <div>• True Dihedral Z/Y/X Spherical Kinematics</div>
          <div>• Real-time PCF Soft Shadow Mapping & Normal Shading</div>
          <div>• Bake Any 3D Perspective Into Sprite Sheets</div>
        </div>
      </div>
    </div>
  );
};

export default Sprite3DViewer;

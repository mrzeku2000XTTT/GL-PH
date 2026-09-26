import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Play,
  Pause,
  Repeat,
  Download,
  Sparkles,
  Sliders,
  Layers,
  FileCode,
  Image as ImageIcon,
  RotateCw,
  Eye,
  Check,
  Zap,
  Grid,
  Film,
  ZoomIn,
  RefreshCw,
  Box,
  Compass,
  Share2
} from 'lucide-react';
import JSZip from 'jszip';
import {
  MotionPreset,
  TreatmentEffect,
  MotionConfig,
  MotionResult,
  generateSpriteMotion,
  createSampleButterflyCanvas,
  calculateBestGrid,
} from '../services/spriteMotionEngine';
import Sprite3DViewer from './Sprite3DViewer';

export const SpriteMotionStudio: React.FC = () => {
  // Source Image state
  const [sourceImageName, setSourceImageName] = useState<string>('Glow Butterfly');
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);

  // Motion Configuration
  const [preset, setPreset] = useState<MotionPreset>('wing_flap');
  const [frameCount, setFrameCount] = useState<number>(12);
  const [fps, setFps] = useState<number>(12);
  const [frameSize, setFrameSize] = useState<number>(256);
  const [loop, setLoop] = useState<boolean>(true);
  const [intensity, setIntensity] = useState<number>(1.0);
  const [speed, setSpeed] = useState<number>(1.0);

  // 3D Camera Angle Configuration
  const [cameraAnglePreset, setCameraAnglePreset] = useState<'front' | 'isometric' | 'side' | 'top' | 'rear' | 'custom'>('front');
  const [yawAngle, setYawAngle] = useState<number>(0); // 0 to 360 deg
  const [pitchAngle, setPitchAngle] = useState<number>(0); // -80 to +85 deg

  // Chroma Key / Background Removal
  const [chromaEnabled, setChromaEnabled] = useState<boolean>(true);
  const [chromaColor, setChromaColor] = useState<string>('#000000');
  const [chromaTolerance, setChromaTolerance] = useState<number>(18);

  // Stylistic Treatment (Pipeline: Source -> Motion -> Treatment -> Sheet)
  const [treatment, setTreatment] = useState<TreatmentEffect>('none');
  const [treatmentIntensity, setTreatmentIntensity] = useState<number>(1.0);
  const [treatmentColor, setTreatmentColor] = useState<string>('#1ff2e1');

  // Generated Motion Result
  const [motionResult, setMotionResult] = useState<MotionResult | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Animation Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number>(0);
  const [previewBg, setPreviewBg] = useState<'dark' | 'checker' | 'white'>('checker');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Tab View in preview panel: 'preview' (2D Player) | '3d' (3D WebGL Studio) | 'sheet' (Packed Grid) | 'json'
  const [viewMode, setViewMode] = useState<'preview' | '3d' | 'sheet' | 'json'>('preview');
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);

  // Initialize with the sample glowing butterfly
  useEffect(() => {
    const butterfly = createSampleButterflyCanvas(512);
    setSourceCanvas(butterfly);
  }, []);

  // Auto-generate motion on initial load or source change or angle change
  useEffect(() => {
    if (sourceCanvas) {
      runGenerateMotion();
    }
  }, [sourceCanvas, yawAngle, pitchAngle]);

  // Animation Playback Loop
  useEffect(() => {
    if (!isPlaying || !motionResult || motionResult.frames.length === 0) {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      return;
    }

    const intervalMs = 1000 / fps;
    playbackTimerRef.current = window.setInterval(() => {
      setCurrentFrameIdx((prev) => {
        const next = prev + 1;
        if (next >= motionResult.frames.length) {
          return loop ? 0 : prev;
        }
        return next;
      });
    }, intervalMs);

    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, fps, motionResult, loop]);

  const runGenerateMotion = async () => {
    if (!sourceCanvas) return;
    setIsGenerating(true);

    try {
      const config: MotionConfig = {
        preset,
        frameCount,
        fps,
        frameSize,
        loop,
        intensity,
        speed,
        cameraAngle: {
          yaw: yawAngle,
          pitch: pitchAngle,
        },
        chromaKey: {
          enabled: chromaEnabled,
          color: chromaColor,
          tolerance: chromaTolerance,
        },
        treatment,
        treatmentIntensity,
        treatmentColor,
      };

      const result = await generateSpriteMotion(sourceCanvas, config, sourceImageName.toLowerCase().replace(/\s+/g, '_'));
      setMotionResult(result);
      setCurrentFrameIdx(0);
    } catch (err) {
      console.error('Failed to generate sprite motion:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const applyCameraPreset = (presetKey: 'front' | 'isometric' | 'side' | 'top' | 'rear') => {
    setCameraAnglePreset(presetKey);
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
        setPitchAngle(75);
        break;
      case 'rear':
        setYawAngle(145);
        setPitchAngle(20);
        break;
    }
  };

  // Image Upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setSourceCanvas(canvas);
        setSourceImageName(file.name.replace(/\.[^/.]+$/, ''));
      }
    };
    img.src = URL.createObjectURL(file);
  };

  // Preset Image Selectors
  const loadPresetButterfly = () => {
    const butterfly = createSampleButterflyCanvas(512);
    setSourceCanvas(butterfly);
    setSourceImageName('Glow Butterfly');
    setPreset('wing_flap');
  };

  // Export handlers
  const exportSpriteSheetPng = () => {
    if (!motionResult) return;
    const link = document.createElement('a');
    link.download = `${motionResult.metadata.name}_${Math.round(yawAngle)}deg_spritesheet_${motionResult.metadata.columns}x${motionResult.metadata.rows}.png`;
    link.href = motionResult.spriteSheetCanvas.toDataURL('image/png');
    link.click();
  };

  const exportAllFramesZip = async () => {
    if (!motionResult) return;
    const zip = new JSZip();
    const folder = zip.folder(`${motionResult.metadata.name}_frames`);

    motionResult.frames.forEach((frame, i) => {
      const padded = String(i + 1).padStart(2, '0');
      const base64Data = frame.dataUrl.replace(/^data:image\/png;base64,/, '');
      folder?.file(`${motionResult.metadata.name}_frame_${padded}.png`, base64Data, { base64: true });
    });

    folder?.file('metadata.json', JSON.stringify(motionResult.metadata, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = `${motionResult.metadata.name}_frames.zip`;
    link.href = URL.createObjectURL(content);
    link.click();
  };

  const exportJsonMetadata = () => {
    if (!motionResult) return;
    const blob = new Blob([JSON.stringify(motionResult.metadata, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.download = `${motionResult.metadata.name}_animation.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  const copyJsonToClipboard = () => {
    if (!motionResult) return;
    navigator.clipboard.writeText(JSON.stringify(motionResult.metadata, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const currentFrame = motionResult?.frames[currentFrameIdx];
  const gridInfo = calculateBestGrid(frameCount);

  return (
    <div className="flex-1 flex flex-col lg:flex-row bg-[#070707] text-[#ececec] overflow-hidden">
      {/* LEFT COLUMN: Controls & Motion Pipeline Configuration */}
      <div className="w-full lg:w-[460px] xl:w-[500px] border-b lg:border-b-0 lg:border-r border-[#1e1e1e] flex flex-col bg-[#0a0a0a] overflow-y-auto">
        <div className="p-5 border-b border-[#1e1e1e]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-wider uppercase text-[#ececec] flex items-center gap-2">
                <Film size={15} className="text-[#1ff2e1]" />
                <span>Sprite Motion Studio</span>
              </h2>
              <p className="text-[11px] text-[#9b9b9b] mt-0.5">
                Generate animated 2D & 3D articulated sprite sheets with perspective angle changing.
              </p>
            </div>
            <div className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161616] text-[#1ff2e1] border border-[#2a2a2a] flex items-center gap-1">
              <Box size={11} />
              <span>3D Ready</span>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-6 text-xs flex-1">
          {/* STEP 1: REFERENCE IMAGE SOURCE */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b] flex items-center gap-1.5">
                <span>1. Reference Image</span>
                <span className="text-[#1ff2e1]">({sourceImageName})</span>
              </label>
              <button
                onClick={loadPresetButterfly}
                className="text-[10px] text-[#1ff2e1] hover:underline cursor-pointer flex items-center gap-1"
              >
                <RefreshCw size={10} />
                <span>Reset Butterfly</span>
              </button>
            </div>

            {/* Upload Area */}
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#2a2a2a] hover:border-[#1ff2e1]/70 rounded-lg p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-[#121212]/50 hover:bg-[#161616]"
              >
                <Upload size={16} className="text-[#9b9b9b]" />
                <span className="text-[11px] text-center font-medium text-[#ececec]">
                  Upload Character
                </span>
                <span className="text-[9px] text-[#5d5d5d]">PNG, JPG, WebP</span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Source Thumbnail preview */}
              <div className="border border-[#2a2a2a] rounded-lg p-2 bg-[#121212] flex flex-col items-center justify-center relative group">
                {sourceCanvas ? (
                  <div className="w-16 h-16 rounded overflow-hidden flex items-center justify-center bg-[#070707] border border-[#222]">
                    <img
                      src={sourceCanvas.toDataURL()}
                      alt="Source"
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded bg-[#161616] flex items-center justify-center text-[#5d5d5d]">
                    <ImageIcon size={20} />
                  </div>
                )}
                <span className="text-[10px] font-mono text-[#9b9b9b] mt-1 truncate max-w-[120px]">
                  {sourceImageName}
                </span>
              </div>
            </div>

            {/* Background Removal / Chroma key */}
            <div className="p-3 rounded-lg bg-[#141414] border border-[#222] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#ececec]">Remove Background (Alpha Mask)</span>
                <input
                  type="checkbox"
                  checked={chromaEnabled}
                  onChange={(e) => setChromaEnabled(e.target.checked)}
                  className="accent-[#1ff2e1] cursor-pointer"
                />
              </div>

              {chromaEnabled && (
                <div className="pt-2 border-t border-[#1e1e1e] grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-[#9b9b9b] block mb-1">Key Color</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={chromaColor}
                        onChange={(e) => setChromaColor(e.target.value)}
                        className="w-7 h-7 rounded border border-[#2a2a2a] bg-transparent cursor-pointer p-0"
                      />
                      <span className="font-mono text-[10px] text-[#ececec]">{chromaColor}</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px] text-[#9b9b9b] mb-1">
                      <span>Tolerance</span>
                      <span className="font-mono text-[#ececec]">{chromaTolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      value={chromaTolerance}
                      onChange={(e) => setChromaTolerance(parseInt(e.target.value, 10))}
                      className="w-full accent-[#1ff2e1] cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STEP 2: MOTION PRESET SELECTOR */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b]">
                2. Motion Kinematics
              </label>
              <span className="text-[10px] font-mono text-[#1ff2e1] uppercase">
                {preset.replace('_', ' ')}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'wing_flap', label: 'Wing Flap', icon: '🦋' },
                { id: 'hover', label: 'Hover', icon: '✨' },
                { id: 'fly', label: 'Fly Fast', icon: '💨' },
                { id: 'idle', label: 'Rest Idle', icon: '🌱' },
                { id: 'bounce', label: 'Bounce', icon: '⚡' },
                { id: 'walk', label: 'Walk', icon: '🚶' },
                { id: 'run', label: 'Run', icon: '🏃' },
                { id: 'jump', label: 'Jump', icon: '⬆️' },
                { id: 'attack', label: 'Attack', icon: '⚔️' },
                { id: 'hit', label: 'Hit Recoil', icon: '💥' },
                { id: 'spin', label: '3D Spin', icon: '🔄' },
                { id: 'breathing', label: 'Breathe', icon: '🫁' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPreset(item.id as MotionPreset)}
                  className={`py-2 px-1.5 rounded text-center border transition-all cursor-pointer ${
                    preset === item.id
                      ? 'bg-[#1e1e1e] border-[#1ff2e1] text-[#ececec] shadow-[0_0_12px_rgba(31,242,225,0.2)]'
                      : 'bg-[#141414] border-[#222222] text-[#9b9b9b] hover:bg-[#1a1a1a] hover:text-[#ececec]'
                  }`}
                >
                  <div className="text-sm mb-0.5">{item.icon}</div>
                  <div className="text-[10px] font-medium leading-tight truncate">{item.label}</div>
                </button>
              ))}
            </div>

            {/* Motion Intensity Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[#9b9b9b] font-medium uppercase tracking-wider">
                  Stroke Amplitude / Intensity
                </span>
                <span className="font-mono text-[#ececec]">{intensity.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="2.2"
                step="0.05"
                value={intensity}
                onChange={(e) => setIntensity(parseFloat(e.target.value))}
                className="w-full accent-[#1ff2e1] cursor-pointer"
              />
            </div>
          </div>

          {/* STEP 3: 3D ANGLE & PERSPECTIVE (NEW!) */}
          <div className="space-y-3 pt-2 border-t border-[#1e1e1e]">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b] flex items-center gap-1.5">
                <Compass size={12} className="text-[#1ff2e1]" />
                <span>3. View Angle & 3D Perspective</span>
              </label>
              <button
                onClick={() => setViewMode('3d')}
                className="text-[10px] font-mono text-[#1ff2e1] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Box size={11} />
                <span>Open 3D WebGL</span>
              </button>
            </div>

            {/* Angle Preset Buttons */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {[
                { id: 'front', label: 'Front (0°)' },
                { id: 'isometric', label: '3/4 Iso (45°)' },
                { id: 'side', label: 'Profile (90°)' },
                { id: 'top', label: 'Top-Down (80°)' },
                { id: 'rear', label: 'Back (145°)' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => applyCameraPreset(item.id as any)}
                  className={`py-1.5 px-1 rounded text-center border text-[10px] font-mono transition-colors cursor-pointer ${
                    cameraAnglePreset === item.id
                      ? 'bg-[#1ff2e1] text-black font-semibold border-[#1ff2e1]'
                      : 'bg-[#141414] border-[#222] text-[#9b9b9b] hover:bg-[#1a1a1a]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Angle Sliders */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-[#9b9b9b]">Yaw (Horizontal)</span>
                  <span className="font-mono text-[#ececec]">{Math.round(yawAngle)}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={yawAngle}
                  onChange={(e) => {
                    setYawAngle(parseInt(e.target.value, 10));
                    setCameraAnglePreset('custom');
                  }}
                  className="w-full accent-[#1ff2e1] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-[#9b9b9b]">Pitch (Tilt)</span>
                  <span className="font-mono text-[#ececec]">{Math.round(pitchAngle)}°</span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="85"
                  value={pitchAngle}
                  onChange={(e) => {
                    setPitchAngle(parseInt(e.target.value, 10));
                    setCameraAnglePreset('custom');
                  }}
                  className="w-full accent-[#1ff2e1] cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* STEP 4: FRAME RATE & DIMENSIONS */}
          <div className="space-y-3 pt-2 border-t border-[#1e1e1e]">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b]">
              4. Frame Count & Output Resolution
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-[#9b9b9b] block mb-1">Frames:</span>
                <div className="flex flex-wrap gap-1">
                  {[4, 6, 8, 12, 16, 24, 32].map((cnt) => (
                    <button
                      key={cnt}
                      onClick={() => setFrameCount(cnt)}
                      className={`px-2 py-1 rounded text-[10px] font-mono border cursor-pointer ${
                        frameCount === cnt
                          ? 'bg-[#1ff2e1] text-black border-[#1ff2e1] font-bold'
                          : 'bg-[#141414] text-[#9b9b9b] border-[#222] hover:bg-[#1a1a1a]'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-[#9b9b9b] block mb-1">Frame FPS:</span>
                <div className="flex flex-wrap gap-1">
                  {[6, 8, 12, 15, 24, 30].map((f) => (
                    <button
                      key={f}
                      onClick={() => setFps(f)}
                      className={`px-2 py-1 rounded text-[10px] font-mono border cursor-pointer ${
                        fps === f
                          ? 'bg-[#9c5fef] text-white border-[#9c5fef] font-bold'
                          : 'bg-[#141414] text-[#9b9b9b] border-[#222] hover:bg-[#1a1a1a]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { size: 128, label: '128 × 128', note: 'Mobile / Retro' },
                { size: 256, label: '256 × 256', note: 'Standard HD' },
                { size: 512, label: '512 × 512', note: 'Ultra Crisp' },
              ].map((s) => (
                <button
                  key={s.size}
                  onClick={() => setFrameSize(s.size)}
                  className={`p-2 rounded border text-left cursor-pointer transition-colors ${
                    frameSize === s.size
                      ? 'bg-[#1e1e1e] border-[#1ff2e1] text-[#ececec]'
                      : 'bg-[#141414] border-[#222] text-[#9b9b9b] hover:bg-[#1a1a1a]'
                  }`}
                >
                  <div className="font-mono text-xs font-semibold text-[#ececec]">{s.label}</div>
                  <div className="text-[9px] text-[#5d5d5d]">{s.note}</div>
                </button>
              ))}
            </div>
          </div>

          {/* STEP 5: STYLISTIC TREATMENT PIPELINE */}
          <div className="space-y-3 pt-2 border-t border-[#1e1e1e]">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[#9b9b9b] flex items-center gap-1.5">
                <Sparkles size={11} className="text-[#1ff2e1]" />
                <span>5. Visual Shader / Stylization Pipeline</span>
              </label>
              <span className="text-[10px] font-mono text-[#9c5fef] uppercase">{treatment}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'none', label: 'Original Art' },
                { id: 'ascii', label: 'ASCII Matrix' },
                { id: 'pixel', label: 'Retro 8-bit' },
                { id: 'dither', label: 'Dithered' },
                { id: 'halftone', label: 'Halftone' },
                { id: 'vhs', label: 'VHS Tape' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTreatment(t.id as TreatmentEffect)}
                  className={`py-1.5 px-2 rounded text-center border text-[11px] font-medium transition-colors cursor-pointer ${
                    treatment === t.id
                      ? 'bg-[#2a2a2a] border-[#9c5fef] text-white font-semibold'
                      : 'bg-[#141414] border-[#222] text-[#9b9b9b] hover:bg-[#1a1a1a]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {treatment !== 'none' && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[10px] text-[#9b9b9b]">Treatment Tint</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={treatmentColor}
                    onChange={(e) => setTreatmentColor(e.target.value)}
                    className="w-6 h-6 rounded border border-[#2a2a2a] bg-transparent cursor-pointer p-0"
                  />
                  <span className="font-mono text-[10px] text-[#ececec]">{treatmentColor}</span>
                </div>
              </div>
            )}
          </div>

          {/* GENERATE ACTION BUTTON */}
          <div className="pt-3">
            <button
              onClick={runGenerateMotion}
              disabled={isGenerating}
              className="w-full py-3 px-4 rounded-lg bg-[#1ff2e1] hover:bg-[#1ff2e1]/90 text-black font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-[0_0_24px_rgba(31,242,225,0.4)] cursor-pointer disabled:opacity-50 active:scale-[0.99]"
            >
              <Zap size={14} className="fill-black" />
              <span>{isGenerating ? 'Synthesizing Poses...' : 'Bake / Regenerate Motion'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Interactive Player, 3D WebGL Studio, Sprite Sheet & Code Inspector */}
      <div className="flex-1 flex flex-col bg-[#070707] overflow-hidden">
        {/* Top View Selector Bar */}
        <div className="h-11 border-b border-[#1e1e1e] px-4 flex items-center justify-between bg-[#0a0a0a]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-[#1e1e1e] text-[#1ff2e1] border border-[#1ff2e1]/40'
                  : 'text-[#9b9b9b] hover:text-[#ececec]'
              }`}
            >
              <Play size={12} />
              <span>2D Player</span>
            </button>

            <button
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-[#1e1e1e] text-[#1ff2e1] border border-[#1ff2e1]/40'
                  : 'text-[#9b9b9b] hover:text-[#ececec]'
              }`}
            >
              <Box size={12} className="text-[#1ff2e1]" />
              <span>3D WebGL Studio</span>
            </button>

            <button
              onClick={() => setViewMode('sheet')}
              className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'sheet'
                  ? 'bg-[#1e1e1e] text-[#1ff2e1] border border-[#1ff2e1]/40'
                  : 'text-[#9b9b9b] hover:text-[#ececec]'
              }`}
            >
              <Grid size={12} />
              <span>Sprite Sheet ({gridInfo.cols}×{gridInfo.rows})</span>
            </button>

            <button
              onClick={() => setViewMode('json')}
              className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'json'
                  ? 'bg-[#1e1e1e] text-[#1ff2e1] border border-[#1ff2e1]/40'
                  : 'text-[#9b9b9b] hover:text-[#ececec]'
              }`}
            >
              <FileCode size={12} />
              <span>JSON Metadata</span>
            </button>
          </div>

          {/* Quick Export Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={exportSpriteSheetPng}
              disabled={!motionResult}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#161616] hover:bg-[#222] border border-[#2a2a2a] text-xs font-medium text-[#ececec] transition-colors cursor-pointer disabled:opacity-40"
              title="Download full resolution transparent PNG sprite sheet"
            >
              <Download size={12} className="text-[#1ff2e1]" />
              <span className="hidden sm:inline">Export PNG</span>
            </button>

            <button
              onClick={exportAllFramesZip}
              disabled={!motionResult}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#161616] hover:bg-[#222] border border-[#2a2a2a] text-xs font-medium text-[#ececec] transition-colors cursor-pointer disabled:opacity-40"
              title="Download all frames as individual PNG files in a ZIP"
            >
              <Layers size={12} className="text-[#9c5fef]" />
              <span className="hidden sm:inline">Frames (.zip)</span>
            </button>
          </div>
        </div>

        {/* View Mode 1: 2D ANIMATION PREVIEW PLAYER */}
        {viewMode === 'preview' && (
          <div className="flex-1 flex flex-col p-4 sm:p-8 items-center justify-between relative overflow-hidden">
            {/* Viewport Controls Bar */}
            <div className="w-full flex items-center justify-between z-10 text-[11px] text-[#9b9b9b]">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[#ececec] uppercase font-semibold">
                  Frame {String(currentFrameIdx + 1).padStart(2, '0')} / {String(frameCount).padStart(2, '0')}
                </span>
                <span className="text-[#5d5d5d]">|</span>
                <span className="font-mono text-[#1ff2e1]">{fps} FPS</span>
                <span className="text-[#5d5d5d]">|</span>
                <span className="font-mono">{frameSize}×{frameSize}px</span>
                <span className="text-[#5d5d5d]">|</span>
                <span className="font-mono text-[#9c5fef]">
                  Angle: {Math.round(yawAngle)}° / {Math.round(pitchAngle)}°
                </span>
              </div>

              {/* Background Style Switcher */}
              <div className="flex items-center gap-1.5 bg-[#121212] p-1 rounded border border-[#222]">
                <button
                  onClick={() => setPreviewBg('checker')}
                  className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                    previewBg === 'checker' ? 'bg-[#2a2a2a] text-white font-medium' : 'text-[#5d5d5d]'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setPreviewBg('dark')}
                  className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                    previewBg === 'dark' ? 'bg-[#2a2a2a] text-white font-medium' : 'text-[#5d5d5d]'
                  }`}
                >
                  Black
                </button>
                <button
                  onClick={() => setPreviewBg('white')}
                  className={`px-2 py-0.5 rounded text-[10px] cursor-pointer ${
                    previewBg === 'white' ? 'bg-[#2a2a2a] text-white font-medium' : 'text-[#5d5d5d]'
                  }`}
                >
                  Light
                </button>
              </div>
            </div>

            {/* Stage Canvas */}
            <div className="flex-1 flex items-center justify-center my-6 relative w-full">
              {currentFrame ? (
                <div
                  className={`relative p-2 rounded-xl border border-[#2a2a2a] transition-all shadow-2xl flex items-center justify-center ${
                    previewBg === 'checker'
                      ? 'bg-[radial-gradient(#222_1px,transparent_1px)] [background-size:16px_16px] bg-[#0c0c0c]'
                      : previewBg === 'dark'
                      ? 'bg-black'
                      : 'bg-white'
                  }`}
                  style={{
                    width: `${Math.min(380, frameSize * 1.2)}px`,
                    height: `${Math.min(380, frameSize * 1.2)}px`,
                  }}
                >
                  {/* Subtle Anchor Crosshair */}
                  <div className="absolute inset-0 pointer-events-none opacity-20 flex items-center justify-center">
                    <div className="w-full h-[1px] bg-[#1ff2e1]/40" />
                    <div className="h-full w-[1px] bg-[#1ff2e1]/40 absolute" />
                  </div>

                  <img
                    src={currentFrame.dataUrl}
                    alt={`Frame ${currentFrame.index}`}
                    className="w-full h-full object-contain relative z-10 transition-transform select-none"
                    style={{ transform: `scale(${zoomLevel})` }}
                  />
                </div>
              ) : (
                <div className="text-center text-[#5d5d5d]">
                  <RotateCw className="animate-spin mx-auto mb-2" size={24} />
                  <span>Preparing motion frames...</span>
                </div>
              )}
            </div>

            {/* Bottom Playback & Scrubber Controls */}
            <div className="w-full max-w-2xl bg-[#0e0e0e] border border-[#222] rounded-xl p-3 sm:p-4 space-y-3 z-10">
              {/* Playback Button Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-8 h-8 rounded-lg bg-[#ececec] hover:bg-white text-black flex items-center justify-center cursor-pointer transition-colors"
                  >
                    {isPlaying ? <Pause size={14} className="fill-black" /> : <Play size={14} className="fill-black" />}
                  </button>

                  <button
                    onClick={() => setLoop(!loop)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
                      loop
                        ? 'bg-[#1a1a1a] border-[#1ff2e1]/50 text-[#1ff2e1]'
                        : 'bg-[#141414] border-[#222] text-[#5d5d5d]'
                    }`}
                  >
                    <Repeat size={12} />
                    <span>Loop</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-[#9b9b9b]">
                  <span>Zoom:</span>
                  {[1.0, 1.25, 1.5].map((z) => (
                    <button
                      key={z}
                      onClick={() => setZoomLevel(z)}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        zoomLevel === z ? 'bg-[#222] text-[#ececec]' : 'text-[#5d5d5d]'
                      }`}
                    >
                      {z}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame Timeline Scrubber Strip */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[#5d5d5d] font-mono">
                  <span>TIMELINE</span>
                  <span>CLICK FRAME TO SCRUB</span>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 bg-[#080808] p-1.5 rounded-lg border border-[#1a1a1a]">
                  {motionResult?.frames.map((frame, idx) => (
                    <button
                      key={frame.index}
                      onClick={() => {
                        setIsPlaying(false);
                        setCurrentFrameIdx(idx);
                      }}
                      className={`relative flex flex-col items-center justify-center p-1 rounded transition-all cursor-pointer ${
                        currentFrameIdx === idx
                          ? 'bg-[#1ff2e1]/20 border border-[#1ff2e1] shadow-[0_0_8px_rgba(31,242,225,0.4)]'
                          : 'bg-[#121212] border border-[#222] hover:bg-[#1a1a1a]'
                      }`}
                    >
                      <img
                        src={frame.dataUrl}
                        alt={`Thumb ${idx}`}
                        className="w-7 h-7 object-contain"
                      />
                      <span className="font-mono text-[9px] mt-0.5 text-[#9b9b9b]">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Mode 2: 3D WEBGL STUDIO (NEW!) */}
        {viewMode === '3d' && (
          <Sprite3DViewer
            sourceCanvas={sourceCanvas}
            preset={preset}
            speed={speed}
            intensity={intensity}
            treatment={treatment}
            treatmentColor={treatmentColor}
          />
        )}

        {/* View Mode 3: SPRITE SHEET INSPECTOR */}
        {viewMode === 'sheet' && (
          <div className="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[#ececec]">
                  Packed Sprite Sheet Grid
                </h3>
                <p className="text-[11px] text-[#9b9b9b] font-mono mt-0.5">
                  {gridInfo.cols} columns × {gridInfo.rows} rows · Sheet size: {gridInfo.cols * frameSize} × {gridInfo.rows * frameSize} px · Angle: {Math.round(yawAngle)}° / {Math.round(pitchAngle)}°
                </p>
              </div>

              <button
                onClick={exportSpriteSheetPng}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1ff2e1] text-black font-semibold text-xs tracking-wider uppercase shadow-[0_0_16px_rgba(31,242,225,0.4)] cursor-pointer"
              >
                <Download size={13} />
                <span>Download Sheet PNG</span>
              </button>
            </div>

            {/* Grid display with border guides */}
            <div className="flex-1 flex items-center justify-center p-4 bg-[#0c0c0c] rounded-xl border border-[#222] overflow-auto">
              {motionResult && (
                <div
                  className="relative border border-[#1ff2e1]/40 rounded shadow-2xl bg-[radial-gradient(#222_1px,transparent_1px)] [background-size:16px_16px]"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${gridInfo.cols}, 1fr)`,
                    maxWidth: '100%',
                  }}
                >
                  {motionResult.frames.map((frame, i) => (
                    <div
                      key={frame.index}
                      className="border border-[#222] relative group hover:border-[#1ff2e1]/60 transition-colors"
                      style={{ width: `${Math.min(120, frameSize / 2)}px`, height: `${Math.min(120, frameSize / 2)}px` }}
                    >
                      <img
                        src={frame.dataUrl}
                        alt={`Cell ${i}`}
                        className="w-full h-full object-contain p-1"
                      />
                      <span className="absolute top-1 left-1 font-mono text-[8px] px-1 rounded bg-black/80 text-[#9b9b9b]">
                        #{String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* View Mode 4: JSON METADATA */}
        {viewMode === 'json' && (
          <div className="flex-1 flex flex-col p-4 sm:p-8 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[#ececec]">
                  Game Engine JSON Metadata
                </h3>
                <p className="text-[11px] text-[#9b9b9b] font-mono mt-0.5">
                  Compatible with Phaser, PixiJS, Godot, Unity 2D Sprite Sheets
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyJsonToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#161616] hover:bg-[#222] border border-[#2a2a2a] text-xs font-medium text-[#ececec] transition-colors cursor-pointer"
                >
                  {copiedJson ? <Check size={12} className="text-[#1ff2e1]" /> : <Share2 size={12} />}
                  <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                </button>

                <button
                  onClick={exportJsonMetadata}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1ff2e1] text-black font-semibold text-xs tracking-wider uppercase cursor-pointer"
                >
                  <Download size={12} />
                  <span>Save .json</span>
                </button>
              </div>
            </div>

            <div className="flex-1 bg-[#0c0c0c] border border-[#222] rounded-xl p-4 overflow-auto font-mono text-xs text-[#1ff2e1] leading-relaxed">
              <pre>{motionResult ? JSON.stringify(motionResult.metadata, null, 2) : '// Generating metadata...'}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpriteMotionStudio;


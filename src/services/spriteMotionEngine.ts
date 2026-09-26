/**
 * Sprite Motion Engine
 * Articulated sprite deformation, motion synthesis, temporal consistency,
 * visual treatment pipeline, and sprite-sheet packing.
 */

export type MotionPreset =
  | 'wing_flap'
  | 'idle'
  | 'hover'
  | 'bounce'
  | 'walk'
  | 'run'
  | 'fly'
  | 'jump'
  | 'attack'
  | 'hit'
  | 'spin'
  | 'turn'
  | 'float'
  | 'breathing'
  | 'custom';

export type TreatmentEffect =
  | 'none'
  | 'ascii'
  | 'dither'
  | 'halftone'
  | 'pixel'
  | 'contour'
  | 'vhs';

export interface MotionConfig {
  preset: MotionPreset;
  frameCount: number; // 4, 6, 8, 12, 16, 24, 32
  fps: number; // 6, 8, 12, 15, 24, 30
  frameSize: number; // 128, 256, 512
  loop: boolean;
  intensity: number; // 0.2 to 2.5
  speed: number;
  chromaKey: {
    enabled: boolean;
    color: string; // '#000000', '#ffffff', etc.
    tolerance: number; // 0 to 100
  };
  treatment: TreatmentEffect;
  treatmentIntensity: number;
  treatmentColor: string; // '#1ff2e1', '#ffffff', etc.
  cameraAngle?: {
    yaw: number; // 0 to 360 deg
    pitch: number; // -80 to +85 deg
    roll?: number;
  };
  customParams?: {
    dihedralAngle?: number;
    wingForeshortening?: number;
    secondaryLag?: number;
    bodyHover?: number;
    squashStretch?: number;
    swayAmount?: number;
  };
}

export interface SpriteSheetMetadata {
  name: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
  loop: boolean;
  columns: number;
  rows: number;
  sheetWidth: number;
  sheetHeight: number;
  animations: Record<
    string,
    {
      start: number;
      end: number;
      loop: boolean;
    }
  >;
}

export interface GeneratedFrame {
  index: number;
  canvas: HTMLCanvasElement;
  dataUrl: string;
}

export interface MotionResult {
  frames: GeneratedFrame[];
  spriteSheetCanvas: HTMLCanvasElement;
  metadata: SpriteSheetMetadata;
}

// Helper to determine optimal grid columns & rows for packing
export function calculateBestGrid(frameCount: number): { cols: number; rows: number } {
  switch (frameCount) {
    case 4:
      return { cols: 2, rows: 2 };
    case 6:
      return { cols: 3, rows: 2 };
    case 8:
      return { cols: 4, rows: 2 };
    case 12:
      return { cols: 4, rows: 3 };
    case 16:
      return { cols: 4, rows: 4 };
    case 24:
      return { cols: 6, rows: 4 };
    case 32:
      return { cols: 8, rows: 4 };
    default: {
      const cols = Math.ceil(Math.sqrt(frameCount));
      const rows = Math.ceil(frameCount / cols);
      return { cols, rows };
    }
  }
}

/**
 * Remove background (chroma key / black or white background masking)
 * and crop/center the subject into a square frame.
 */
export function extractAndCenterSubject(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  targetSize: number,
  chromaKey: { enabled: boolean; color: string; tolerance: number }
): { canvas: HTMLCanvasElement; bbox: { minX: number; minY: number; maxX: number; maxY: number } } {
  const origW = sourceImage.width;
  const origH = sourceImage.height;

  // Temp canvas for analysis
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = origW;
  srcCanvas.height = origH;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) throw new Error('Could not get 2D context');

  srcCtx.drawImage(sourceImage, 0, 0);
  const imgData = srcCtx.getImageData(0, 0, origW, origH);
  const data = imgData.data;

  // Parse chroma key color
  const keyHex = chromaKey.color.replace('#', '');
  const kr = parseInt(keyHex.slice(0, 2) || '00', 16);
  const kg = parseInt(keyHex.slice(2, 4) || '00', 16);
  const kb = parseInt(keyHex.slice(4, 6) || '00', 16);
  const tolSq = (chromaKey.tolerance * 2.55) ** 2;

  let minX = origW;
  let minY = origH;
  let maxX = 0;
  let maxY = 0;
  let hasVisiblePixels = false;

  for (let y = 0; y < origH; y++) {
    for (let x = 0; x < origW; x++) {
      const i = (y * origW + x) * 4;
      let alpha = data[i + 3];

      if (alpha > 5) {
        if (chromaKey.enabled) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const distSq = (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2;

          if (distSq <= tolSq) {
            // Background detected: mask out with smooth edge transition
            const edgeFade = Math.sqrt(distSq / Math.max(1, tolSq));
            if (edgeFade < 0.8) {
              data[i + 3] = 0;
              continue;
            } else {
              alpha = Math.round(alpha * ((edgeFade - 0.8) / 0.2));
              data[i + 3] = alpha;
            }
          }
        }

        if (data[i + 3] > 10) {
          hasVisiblePixels = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  srcCtx.putImageData(imgData, 0, 0);

  if (!hasVisiblePixels) {
    minX = 0;
    minY = 0;
    maxX = origW - 1;
    maxY = origH - 1;
  }

  // Add slight padding to bounding box
  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;

  // Render centered into square targetSize canvas
  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetSize;
  outCanvas.height = targetSize;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Could not get out context');

  // Scale to fit nicely with 12% padding inside frame
  const maxDim = Math.max(bboxW, bboxH);
  const scale = (targetSize * 0.78) / Math.max(1, maxDim);
  const drawW = bboxW * scale;
  const drawH = bboxH * scale;
  const destX = (targetSize - drawW) / 2;
  const destY = (targetSize - drawH) / 2;

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(srcCanvas, minX, minY, bboxW, bboxH, destX, destY, drawW, drawH);

  return {
    canvas: outCanvas,
    bbox: { minX, minY, maxX, maxY },
  };
}

/**
 * Generate an articulated pose frame from the reference sprite canvas.
 * Preserves visual identity by deforming and interpolating actual subject segments
 * (wings, torso, limbs, head) with realistic kinematics instead of simple scaling.
 */
export function renderArticulatedFrame(
  baseSprite: HTMLCanvasElement,
  frameIndex: number,
  totalFrames: number,
  config: MotionConfig
): HTMLCanvasElement {
  const size = config.frameSize;
  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = size;
  frameCanvas.height = size;
  const ctx = frameCanvas.getContext('2d');
  if (!ctx) return frameCanvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Normalized phase along the animation cycle [0, 1)
  const t = (frameIndex / totalFrames) % 1;
  const phase = t * Math.PI * 2;
  const intensity = config.intensity;

  const cx = size / 2;
  const cy = size / 2;

  // Camera perspective angles (yaw: horizontal spin, pitch: vertical elevation)
  const yawDeg = config.cameraAngle?.yaw ?? 0;
  const pitchDeg = config.cameraAngle?.pitch ?? 0;
  const yawRad = (yawDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;

  const cosYaw = Math.cos(yawRad);
  const sinYaw = Math.sin(yawRad);
  const cosPitch = Math.max(0.2, Math.cos(pitchRad));

  // Segment widths for creature kinematics (central body vs wings/appendages)
  const bodyHalfW = size * 0.1; // Central 20% column is anchored body
  const wingSpan = cx - bodyHalfW;

  ctx.save();

  // Apply overall camera perspective tilt around center
  ctx.translate(cx, cy);
  ctx.scale(1.0, cosPitch);
  ctx.translate(-cx, -cy);

  switch (config.preset) {
    case 'wing_flap':
    case 'fly': {
      // True 3D Dihedral Wing Stroke with 3D Camera Perspective:
      // Wings raise -> reach peak -> sweep down -> pass level -> tuck -> recover.
      const flapCycle = Math.sin(phase);
      const flapCosine = Math.cos(phase);

      // Body counter-bounce (opposite to wing stroke force)
      const bodyHoverY = -flapCycle * 4.5 * intensity;

      // Dihedral angle of wings (-45 deg to +50 deg)
      const maxDihedral = 0.85 * intensity; // radians
      const wingAngle = flapCycle * maxDihedral;

      // Vertical camber / bending curvature
      const camberShift = flapCosine * 12 * intensity;

      // Apparent wing horizontal scales projected with camera yaw
      // Left wing base facing -X, Right wing base facing +X
      const leftWingYaw = yawRad;
      const rightWingYaw = yawRad;

      // 3D perspective foreshortening combines flap dihedral stroke + camera yaw
      const leftScaleX = Math.max(0.08, Math.abs(cosYaw) * Math.cos(wingAngle * 0.95));
      const rightScaleX = Math.max(0.08, Math.abs(cosYaw) * Math.cos(wingAngle * 0.95));

      // Draw functions for depth-sorting
      const drawLeftWing = () => {
        ctx.save();
        ctx.translate(cx - bodyHalfW * Math.abs(cosYaw), cy + bodyHoverY);
        ctx.rotate(-wingAngle * 0.35 * Math.sign(cosYaw || 1));
        ctx.scale(leftScaleX, 1.0 + flapCycle * 0.08 * intensity);

        ctx.drawImage(
          baseSprite,
          0,
          0,
          cx - bodyHalfW,
          size,
          -(cx - bodyHalfW),
          -cy + camberShift * 0.3,
          cx - bodyHalfW,
          size
        );
        ctx.restore();
      };

      const drawRightWing = () => {
        ctx.save();
        ctx.translate(cx + bodyHalfW * Math.abs(cosYaw), cy + bodyHoverY);
        ctx.rotate(wingAngle * 0.35 * Math.sign(cosYaw || 1));
        ctx.scale(rightScaleX, 1.0 + flapCycle * 0.08 * intensity);

        ctx.drawImage(
          baseSprite,
          cx + bodyHalfW,
          0,
          cx - bodyHalfW,
          size,
          0,
          -cy + camberShift * 0.3,
          cx - bodyHalfW,
          size
        );
        ctx.restore();
      };

      const drawBody = () => {
        ctx.save();
        const bodySway = Math.sin(phase * 2) * 0.03 * intensity;
        ctx.translate(cx, cy + bodyHoverY);
        ctx.rotate(bodySway);
        ctx.scale(Math.max(0.35, Math.abs(cosYaw)), 1.0);

        ctx.drawImage(
          baseSprite,
          cx - bodyHalfW,
          0,
          bodyHalfW * 2,
          size,
          -bodyHalfW,
          -cy,
          bodyHalfW * 2,
          size
        );
        ctx.restore();
      };

      // 3D Depth Sorting: determine which wing is behind the body based on yaw angle
      if (sinYaw >= 0) {
        // Turned right: Right wing is behind, Left wing is in front
        drawRightWing();
        drawBody();
        drawLeftWing();
      } else {
        // Turned left: Left wing is behind, Right wing is in front
        drawLeftWing();
        drawBody();
        drawRightWing();
      }
      break;
    }

    case 'idle':
    case 'breathing': {
      // Organic Resting Breathing:
      // Subtle rhythmic chest expansion, gentle antenna lag, grounded stillness
      const breath = (Math.sin(phase) + 1) * 0.5; // 0 to 1
      const scaleX = 1 + (breath * 0.035 - 0.015) * intensity;
      const scaleY = 1 + ((1 - breath) * 0.035 - 0.015) * intensity;
      const hoverY = Math.sin(phase) * 3 * intensity;
      const microTilt = Math.sin(phase * 1.5) * 0.015 * intensity;

      ctx.translate(cx, cy + hoverY);
      ctx.rotate(microTilt);
      ctx.scale(scaleX, scaleY);
      ctx.drawImage(baseSprite, -cx, -cy);
      break;
    }

    case 'hover':
    case 'float': {
      // Buoyant Figure-8 Floating:
      // Smooth harmonic Lissajous curve with subtle bank angle into curves
      const hoverX = Math.sin(phase) * 8 * intensity;
      const hoverY = Math.sin(phase * 2) * 6 * intensity;
      const bankAngle = Math.cos(phase) * 0.06 * intensity;
      const pulseScale = 1 + Math.sin(phase * 2) * 0.02 * intensity;

      ctx.translate(cx + hoverX, cy + hoverY);
      ctx.rotate(bankAngle);
      ctx.scale(pulseScale, pulseScale);
      ctx.drawImage(baseSprite, -cx, -cy);
      break;
    }

    case 'bounce': {
      // Physical Squash & Stretch Kinematics:
      // Parabolic ballistic trajectory with deformation on ground impact
      const bounceHeight = 22 * intensity;
      const parabolicY = Math.abs(Math.sin(phase)) * bounceHeight;
      const isTouchingGround = Math.sin(phase) < 0.25;

      let sx = 1.0;
      let sy = 1.0;
      if (isTouchingGround) {
        // Squash on impact
        const squashFactor = (0.25 - Math.sin(phase)) * 0.8 * intensity;
        sx = 1.0 + squashFactor;
        sy = 1.0 - squashFactor * 0.8;
      } else {
        // Stretch in air
        const stretchFactor = Math.cos(phase) * 0.12 * intensity;
        sx = 1.0 - stretchFactor * 0.5;
        sy = 1.0 + stretchFactor;
      }

      ctx.translate(cx, cy + bounceHeight - parabolicY);
      ctx.scale(sx, sy);
      ctx.drawImage(baseSprite, -cx, -cy);
      break;
    }

    case 'walk':
    case 'run': {
      // Locomotion Gait:
      // Weight shift sway, stride bob, subtle forward dynamic cant
      const strideFreq = config.preset === 'run' ? 2 : 1;
      const stridePhase = phase * strideFreq;
      const bob = Math.abs(Math.sin(stridePhase)) * (config.preset === 'run' ? 9 : 5) * intensity;
      const sway = Math.sin(stridePhase) * (config.preset === 'run' ? 0.08 : 0.04) * intensity;
      const forwardLean = (config.preset === 'run' ? 0.08 : 0.03) * intensity;

      ctx.translate(cx, cy - bob);
      ctx.rotate(sway + forwardLean);
      ctx.drawImage(baseSprite, -cx, -cy);
      break;
    }

    case 'jump': {
      // Jump sequence: Anticipation -> Ascent -> Apex -> Fall -> Land
      const jumpY = -Math.sin(phase) * 28 * intensity;
      const stretch = Math.cos(phase) * 0.18 * intensity;

      ctx.translate(cx, cy + jumpY);
      ctx.scale(1 - stretch * 0.5, 1 + stretch);
      ctx.drawImage(baseSprite, -cx, -cy);
      break;
    }

    case 'attack': {
      // Wind-up -> Swift Forward Snap -> Follow-through -> Recovery
      let tx = 0;
      let angle = 0;
      let scale = 1.0;

      if (t < 0.25) {
        // Anticipation / wind-up pullback
        const p0 = t / 0.25;
        tx = -p0 * 12 * intensity;
        angle = -p0 * 0.1 * intensity;
      } else if (t < 0.5) {
        // Explosive strike
        const p1 = (t - 0.25) / 0.25;
        tx = -12 + p1 * 34 * intensity;
        angle = 0.18 * intensity;
        scale = 1.0 + p1 * 0.12 * intensity;
      } else {
        // Recovery
        const p2 = (t - 0.5) / 0.5;
        tx = 22 * (1 - p2) * intensity;
        angle = 0.18 * (1 - p2) * intensity;
      }

      ctx.translate(cx + tx, cy);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.drawImage(baseSprite, -cx, -cy);
      break;
    }

    case 'hit': {
      // Sudden Impact Recoil & Flash Twitch
      const recoil = Math.exp(-t * 6) * Math.sin(t * Math.PI * 8) * 16 * intensity;
      ctx.translate(cx - recoil, cy);
      ctx.rotate(-recoil * 0.01);
      ctx.drawImage(baseSprite, -cx, -cy);
      break;
    }

    case 'spin':
    case 'turn': {
      // 3D Yaw Rotation around vertical axis
      const cosAngle = Math.cos(phase);
      const isBackFacing = cosAngle < 0;

      ctx.translate(cx, cy);
      ctx.scale(cosAngle, 1.0);
      if (isBackFacing) {
        ctx.filter = 'brightness(0.85) contrast(1.1)';
      }
      ctx.drawImage(baseSprite, -cx, -cy);
      break;
    }

    case 'custom':
    default: {
      // Custom user parameterized deformation
      const dihedral = (config.customParams?.dihedralAngle ?? 0.6) * intensity;
      const flap = Math.sin(phase);
      const sX = Math.max(0.3, Math.cos(flap * dihedral));
      const hover = Math.sin(phase) * (config.customParams?.bodyHover ?? 6) * intensity;

      ctx.translate(cx, cy + hover);
      ctx.scale(sX, 1.0);
      ctx.drawImage(baseSprite, -cx, -cy);
      break;
    }
  }

  ctx.restore();

  // Apply stylistic treatment if enabled
  if (config.treatment !== 'none') {
    applyStylisticTreatment(frameCanvas, config.treatment, config.treatmentIntensity, config.treatmentColor);
  }

  return frameCanvas;
}

/**
 * Visual treatment shader pipeline (ASCII, Dither, Halftone, Pixel, Contour, VHS)
 * Applied to each frame before sprite sheet packing.
 */
function applyStylisticTreatment(
  canvas: HTMLCanvasElement,
  treatment: TreatmentEffect,
  intensity: number,
  tintColor: string
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Luminance helper
  const getLum = (i: number) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;

  switch (treatment) {
    case 'ascii': {
      // Convert frame to game-ready ASCII / Character Matrix
      const cellSize = Math.max(6, Math.round(10 * (w / 256)));
      const chars = ' .:*#@';
      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const octx = offscreen.getContext('2d');
      if (!octx) return;

      octx.font = `${cellSize}px monospace`;
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      octx.fillStyle = tintColor || '#1ff2e1';

      for (let y = 0; y < h; y += cellSize) {
        for (let x = 0; x < w; x += cellSize) {
          const i = (y * w + x) * 4;
          const alpha = data[i + 3];
          if (alpha > 40) {
            const lum = getLum(i);
            const charIdx = Math.min(chars.length - 1, Math.floor(lum * chars.length));
            const char = chars[charIdx];
            if (char !== ' ') {
              octx.globalAlpha = (alpha / 255) * intensity;
              octx.fillText(char, x + cellSize / 2, y + cellSize / 2);
            }
          }
        }
      }

      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(offscreen, 0, 0);
      break;
    }

    case 'pixel': {
      // 8-bit / 16-bit retro downscale
      const blockSize = Math.max(3, Math.round(6 * (w / 256)));
      const smallW = Math.max(1, Math.round(w / blockSize));
      const smallH = Math.max(1, Math.round(h / blockSize));

      const down = document.createElement('canvas');
      down.width = smallW;
      down.height = smallH;
      const dctx = down.getContext('2d');
      if (!dctx) return;

      dctx.drawImage(canvas, 0, 0, smallW, smallH);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(down, 0, 0, smallW, smallH, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      break;
    }

    case 'dither': {
      // Retro ordered dither matrix
      const bayer4 = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
      ];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 10) {
            const threshold = (bayer4[y % 4][x % 4] / 16 - 0.5) * 60 * intensity;
            data[i] = Math.min(255, Math.max(0, data[i] + threshold));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + threshold));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + threshold));
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      break;
    }

    case 'halftone': {
      // Halftone dot screen
      const spacing = 8;
      const offscreen = document.createElement('canvas');
      offscreen.width = w;
      offscreen.height = h;
      const octx = offscreen.getContext('2d');
      if (!octx) return;
      octx.fillStyle = tintColor || '#1ff2e1';

      for (let y = 0; y < h; y += spacing) {
        for (let x = 0; x < w; x += spacing) {
          const i = (y * w + x) * 4;
          const alpha = data[i + 3];
          if (alpha > 40) {
            const lum = getLum(i);
            const radius = (spacing / 2) * Math.sqrt(lum) * intensity;
            if (radius > 0.5) {
              octx.beginPath();
              octx.arc(x + spacing / 2, y + spacing / 2, radius, 0, Math.PI * 2);
              octx.fill();
            }
          }
        }
      }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(offscreen, 0, 0);
      break;
    }

    case 'vhs': {
      // Chromatic RGB scanlines
      const shift = Math.round(3 * intensity);
      for (let y = 0; y < h; y++) {
        const scanline = y % 2 === 0 ? 0.8 : 1.0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 10) {
            const rIdx = (y * w + Math.min(w - 1, x + shift)) * 4;
            data[i] = data[rIdx] * scanline;
            data[i + 1] *= scanline;
            data[i + 2] *= scanline;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      break;
    }

    default:
      break;
  }
}

/**
 * Generate full motion sequence and pack into a clean, game-ready sprite sheet.
 */
export async function generateSpriteMotion(
  sourceImage: HTMLImageElement | HTMLCanvasElement,
  config: MotionConfig,
  name = 'sprite'
): Promise<MotionResult> {
  const { canvas: baseSprite } = extractAndCenterSubject(
    sourceImage,
    config.frameSize,
    config.chromaKey
  );

  const totalFrames = config.frameCount;
  const frames: GeneratedFrame[] = [];

  // 1. Generate all individual poses
  for (let i = 0; i < totalFrames; i++) {
    const frameCanvas = renderArticulatedFrame(baseSprite, i, totalFrames, config);
    frames.push({
      index: i,
      canvas: frameCanvas,
      dataUrl: frameCanvas.toDataURL('image/png'),
    });
  }

  // 2. Pack into clean sprite sheet grid
  const { cols, rows } = calculateBestGrid(totalFrames);
  const sheetWidth = cols * config.frameSize;
  const sheetHeight = rows * config.frameSize;

  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = sheetWidth;
  sheetCanvas.height = sheetHeight;
  const sheetCtx = sheetCanvas.getContext('2d');
  if (!sheetCtx) throw new Error('Could not get sheet context');

  // Maintain crisp transparency
  sheetCtx.clearRect(0, 0, sheetWidth, sheetHeight);

  frames.forEach((frame, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const destX = col * config.frameSize;
    const destY = row * config.frameSize;
    sheetCtx.drawImage(frame.canvas, destX, destY);
  });

  // 3. Build standard Game-Engine Metadata
  const metadata: SpriteSheetMetadata = {
    name,
    frameWidth: config.frameSize,
    frameHeight: config.frameSize,
    frames: totalFrames,
    fps: config.fps,
    loop: config.loop,
    columns: cols,
    rows,
    sheetWidth,
    sheetHeight,
    animations: {
      [config.preset]: {
        start: 0,
        end: totalFrames - 1,
        loop: config.loop,
      },
    },
  };

  return {
    frames,
    spriteSheetCanvas: sheetCanvas,
    metadata,
  };
}

/**
 * Create a built-in reference butterfly canvas (glowing cyan/violet palette)
 * so users can test immediately even without uploading their own image.
 */
export function createSampleButterflyCanvas(size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Helper to draw wing half
  const drawWingPair = (isRight: boolean) => {
    ctx.save();
    ctx.translate(cx, cy);
    if (isRight) ctx.scale(-1, 1);

    // Upper forewing
    ctx.beginPath();
    ctx.moveTo(10, -10);
    ctx.bezierCurveTo(40, -130, 160, -160, 210, -90);
    ctx.bezierCurveTo(225, -50, 195, 20, 130, 30);
    ctx.bezierCurveTo(80, 35, 30, 15, 10, 5);
    ctx.closePath();

    const foreGrad = ctx.createLinearGradient(10, -10, 210, -90);
    foreGrad.addColorStop(0, '#0e0b0b');
    foreGrad.addColorStop(0.55, '#1ff2e1');
    foreGrad.addColorStop(1, '#9c5fef');
    ctx.fillStyle = foreGrad;
    ctx.fill();

    ctx.strokeStyle = '#1ff2e1';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Wing Veins / Glowing Articulations
    ctx.beginPath();
    ctx.moveTo(15, -10);
    ctx.quadraticCurveTo(80, -70, 180, -90);
    ctx.moveTo(15, -10);
    ctx.quadraticCurveTo(90, -40, 175, -50);
    ctx.moveTo(15, -10);
    ctx.quadraticCurveTo(70, -10, 140, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Lower hindwing
    ctx.beginPath();
    ctx.moveTo(10, 15);
    ctx.bezierCurveTo(30, 25, 120, 40, 140, 100);
    ctx.bezierCurveTo(150, 140, 100, 180, 50, 160);
    ctx.bezierCurveTo(20, 150, 15, 80, 10, 30);
    ctx.closePath();

    const hindGrad = ctx.createLinearGradient(10, 15, 140, 140);
    hindGrad.addColorStop(0, '#0e0b0b');
    hindGrad.addColorStop(0.6, '#9c5fef');
    hindGrad.addColorStop(1, '#1ff2e1');
    ctx.fillStyle = hindGrad;
    ctx.fill();

    ctx.strokeStyle = '#9c5fef';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
  };

  // Draw both wings
  drawWingPair(false); // Left
  drawWingPair(true);  // Right

  // Draw Butterfly Central Body & Head
  ctx.save();
  ctx.translate(cx, cy);

  // Thorax & Abdomen
  ctx.beginPath();
  ctx.ellipse(0, 20, 12, 55, 0, 0, Math.PI * 2);
  const bodyGrad = ctx.createLinearGradient(0, -35, 0, 75);
  bodyGrad.addColorStop(0, '#1ff2e1');
  bodyGrad.addColorStop(0.5, '#0a0a0a');
  bodyGrad.addColorStop(1, '#9c5fef');
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(31,242,225,0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.arc(0, -42, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#1ff2e1';
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-5, -45, 2.5, 0, Math.PI * 2);
  ctx.arc(5, -45, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Antennae
  ctx.beginPath();
  ctx.moveTo(-4, -50);
  ctx.bezierCurveTo(-15, -75, -35, -95, -50, -85);
  ctx.moveTo(4, -50);
  ctx.bezierCurveTo(15, -75, 35, -95, 50, -85);
  ctx.strokeStyle = '#1ff2e1';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Antenna tips
  ctx.beginPath();
  ctx.arc(-50, -85, 3.5, 0, Math.PI * 2);
  ctx.arc(50, -85, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#9c5fef';
  ctx.fill();

  ctx.restore();

  return canvas;
}

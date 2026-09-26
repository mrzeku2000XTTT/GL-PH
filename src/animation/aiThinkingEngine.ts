/**
 * AI Thinking Animation Engine
 * Derived from the Gradientool visual rendering pipeline.
 *
 * Implements an infinite, continuous time-based animation loop specifically designed
 * for AI Thinking / Loading states of indeterminate duration.
 *
 * Reuses the exact OKLab color interpolation, radial bar geometry, tactile 3D relief,
 * seam lighting, and velvety grain shader from the original artwork.
 */

export interface ThinkingOptions {
  speed?: number; // 0.5 = subtle, 1 = normal, 1.5 = energetic, 2 = fast
  intensity?: number; // 0.5 = gentle, 1 = standard, 2 = dramatic
  idleMode?: 'ambient' | 'still'; // whether to breathe subtly when idle or stay still
  transparentBg?: boolean;
}

export interface StopThinkingOptions {
  immediate?: boolean;
}

export type ThinkingState = 'idle' | 'transition_in' | 'thinking' | 'transition_out';

export interface EngineListener {
  (state: ThinkingState, info: { elapsedSec: number; intensity: number; speed: number }): void;
}

// Color conversion helpers (OKLab color space as used in original visual)
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
}

function rgbToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]: [number, number, number]): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function oklabLerp(
  rgb1: [number, number, number],
  rgb2: [number, number, number],
  t: number
): [number, number, number] {
  const lab1 = rgbToOklab(rgb1);
  const lab2 = rgbToOklab(rgb2);
  return oklabToRgb([
    lab1[0] + (lab2[0] - lab1[0]) * t,
    lab1[1] + (lab2[1] - lab1[1]) * t,
    lab1[2] + (lab2[2] - lab1[2]) * t,
  ]);
}

function oklabHueRotate(rgb: [number, number, number], deg: number): [number, number, number] {
  if (!deg) return rgb;
  const [L, a, b] = rgbToOklab(rgb);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return oklabToRgb([L, a * cos - b * sin, a * sin + b * cos]);
}

function formatRgb([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function sampleTable(table: Array<[number, [number, number, number]]>, t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  let idx = 0;
  while (idx < table.length - 2 && table[idx + 1][0] <= clamped) idx++;
  const t0 = table[idx][0];
  const c0 = table[idx][1];
  const t1 = table[idx + 1][0];
  const c1 = table[idx + 1][1];
  const factor = t1 > t0 ? Math.min(1, Math.max(0, (clamped - t0) / (t1 - t0))) : 0;
  return [
    c0[0] + (c1[0] - c0[0]) * factor,
    c0[1] + (c1[1] - c0[1]) * factor,
    c0[2] + (c1[2] - c0[2]) * factor,
  ];
}

function buildColorTable(
  stops: Array<{ pos: number; color: string }>,
  hueRotate: number
): Array<[number, [number, number, number]]> {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const mapped = sorted.map((s) => ({
    p: Math.max(0, Math.min(1, s.pos)),
    c: hueRotate ? oklabHueRotate(hexToRgb(s.color), hueRotate) : hexToRgb(s.color),
  }));
  if (mapped[0].p > 0) mapped.unshift({ p: 0, c: mapped[0].c });
  if (mapped[mapped.length - 1].p < 1) mapped.push({ p: 1, c: mapped[mapped.length - 1].c });

  const table: Array<[number, [number, number, number]]> = [];
  const SAMPLES = 40;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    let segIdx = 0;
    for (let k = 0; k < mapped.length - 1; k++) {
      if (t >= mapped[k].p && t <= mapped[k + 1].p) {
        segIdx = k;
        break;
      }
    }
    const s0 = mapped[segIdx];
    const s1 = mapped[segIdx + 1];
    const span = s1.p - s0.p;
    const factor = span > 0 ? (t - s0.p) / span : 0;
    table.push([t, oklabLerp(s0.c, s1.c, factor)]);
  }
  return table;
}

// The exact base artwork settings from gradientool-d68046f2.html
export const BASE_VISUAL_CONFIG = {
  count: 21,
  waveFreq: 2,
  peakPos: 0.2022126134548713,
  curveExp: 2.455506918016573,
  depth: 0.058243725697505286,
  sweep: 360,
  innerRadius: 0.3567255570208924,
  margin: 0.12699160062667605,
  direction: 'up-left', // -3 * Math.PI / 4
  gradMap: 'across',
  hueDrift: -12,
  hueRotate: 0,
  bgColor: '#000000',
  shadow: 0.6851383933123134,
  depth3d: 1.1178421754793058,
  seam: 0.03845314367786766,
  grainIntensity: 0.7357297307815104,
  stops: [
    { pos: 0, color: '#0e0b0b' },
    { pos: 0.5650686367543659, color: '#1ff2e1' },
    { pos: 1, color: '#9c5fef' },
  ],
};

// Direction angles mapping from original engine
const DIRECTION_ANGLES: Record<string, number> = {
  up: -Math.PI / 2,
  'up-right': -Math.PI / 4,
  right: 0,
  'down-right': Math.PI / 4,
  down: Math.PI / 2,
  'down-left': (3 * Math.PI) / 4,
  left: Math.PI,
  'up-left': (-3 * Math.PI) / 4,
};

// Radial shadow stops
const RADIAL_SHADOW_RAMP: Array<[number, number]> = [
  [0.0, 1.0],
  [0.25, 0.844],
  [0.5, 0.5],
  [0.75, 0.156],
  [1.0, 0.0],
];

// Helper to generate soft film grain data
function generateFineGrain(w: number, h: number): ImageData {
  const gaussian = () => (Math.random() + Math.random() + Math.random()) * 2 - 3;
  const imgData = new ImageData(w, h);
  const data = imgData.data;
  const contrast = 40;
  const jitter = 5;
  for (let i = 0; i < data.length; i += 4) {
    const val = gaussian() * contrast;
    const r = 128 + val + gaussian() * jitter;
    const g = 128 + val + gaussian() * jitter;
    const b = 128 + val + gaussian() * jitter;
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    data[i + 3] = 255;
  }
  return imgData;
}

function generateMediumGrain(w: number, h: number): ImageData {
  const gaussian = () => (Math.random() + Math.random() + Math.random()) * 2 - 3;
  const imgData = new ImageData(w, h);
  const data = imgData.data;
  const contrast = 95;
  for (let i = 0; i < data.length; i += 4) {
    const val = gaussian() * contrast;
    const r = 128 + val;
    const g = 126 + val;
    const b = 120 + val;
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    data[i + 3] = 255;
  }
  return imgData;
}

export class AiThinkingAnimationController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isThinking = false;
  private speed = 1.0;
  private intensity = 1.0;
  private idleMode: 'ambient' | 'still' = 'ambient';
  private transparentBg = false;

  private state: ThinkingState = 'idle';
  private transitionProgress = 0; // 0 = idle, 1 = full thinking
  private transitionStartTime = 0;
  private transitionDuration = 350; // ms

  private rafId: number | null = null;
  private startTime = 0;
  private lastTime = 0;
  private accumulatedPhase = BASE_VISUAL_CONFIG.peakPos * 2 * Math.PI;

  private grainFineCanvas: HTMLCanvasElement | null = null;
  private grainMedCanvas: HTMLCanvasElement | null = null;
  private cachedGrainDims = '';

  private listeners = new Set<EngineListener>();

  constructor(canvas: HTMLCanvasElement, options?: ThinkingOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context from canvas');
    this.ctx = ctx;

    if (options?.speed !== undefined) this.speed = options.speed;
    if (options?.intensity !== undefined) this.intensity = options.intensity;
    if (options?.idleMode !== undefined) this.idleMode = options.idleMode;
    if (options?.transparentBg !== undefined) this.transparentBg = options.transparentBg;

    this.startTime = performance.now();
    this.lastTime = this.startTime;

    // Build initial grain cache
    this.updateCanvasResolution();
    this.renderFrame(this.startTime);

    // If idleMode is ambient, start ambient rAF loop
    if (this.idleMode === 'ambient') {
      this.ensureLoopRunning();
    }
  }

  public subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    listener(this.state, {
      elapsedSec: (performance.now() - this.startTime) / 1000,
      intensity: this.intensity,
      speed: this.speed,
    });
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const info = {
      elapsedSec: (performance.now() - this.startTime) / 1000,
      intensity: this.intensity,
      speed: this.speed,
    };
    this.listeners.forEach((fn) => fn(this.state, info));
  }

  public start(options?: { speed?: number; intensity?: number }) {
    if (options?.speed !== undefined) this.speed = options.speed;
    if (options?.intensity !== undefined) this.intensity = options.intensity;

    if (this.isThinking && this.state === 'thinking') {
      return; // Already actively thinking
    }

    this.isThinking = true;
    this.state = 'transition_in';
    this.transitionStartTime = performance.now();
    this.notify();
    this.ensureLoopRunning();
  }

  public stop(options?: StopThinkingOptions) {
    if (!this.isThinking && this.state === 'idle') {
      return;
    }

    if (options?.immediate) {
      this.isThinking = false;
      this.state = 'idle';
      this.transitionProgress = 0;
      this.notify();
      if (this.idleMode === 'still') {
        this.stopLoop();
        this.renderFrame(performance.now());
      }
      return;
    }

    this.isThinking = false;
    this.state = 'transition_out';
    this.transitionStartTime = performance.now();
    this.notify();
    this.ensureLoopRunning();
  }

  public setSpeed(speed: number) {
    this.speed = Math.max(0.1, Math.min(5.0, speed));
    this.notify();
  }

  public setIntensity(intensity: number) {
    this.intensity = Math.max(0.1, Math.min(3.0, intensity));
    this.notify();
  }

  public setIdleMode(mode: 'ambient' | 'still') {
    this.idleMode = mode;
    if (!this.isThinking && this.state === 'idle') {
      if (mode === 'ambient') {
        this.ensureLoopRunning();
      } else {
        this.stopLoop();
        this.renderFrame(performance.now());
      }
    }
  }

  public setTransparentBg(transparent: boolean) {
    this.transparentBg = transparent;
    this.renderFrame(performance.now());
  }

  public getIsThinking(): boolean {
    return this.isThinking;
  }

  public getState(): ThinkingState {
    return this.state;
  }

  public getSpeed(): number {
    return this.speed;
  }

  public getIntensity(): number {
    return this.intensity;
  }

  private ensureLoopRunning() {
    if (this.rafId === null) {
      this.lastTime = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (time: number) => {
    const dt = Math.min(0.1, (time - this.lastTime) / 1000); // delta in seconds
    this.lastTime = time;

    // Handle smooth state transitions
    if (this.state === 'transition_in') {
      const elapsed = time - this.transitionStartTime;
      const progress = Math.min(1, elapsed / this.transitionDuration);
      // Cubic ease-out
      this.transitionProgress = 1 - Math.pow(1 - progress, 3);
      if (progress >= 1) {
        this.state = 'thinking';
        this.transitionProgress = 1;
        this.notify();
      }
    } else if (this.state === 'transition_out') {
      const elapsed = time - this.transitionStartTime;
      const progress = Math.min(1, elapsed / this.transitionDuration);
      // Cubic ease-in-out
      this.transitionProgress = 1 - progress * progress * (3 - 2 * progress);
      if (progress >= 1) {
        this.state = 'idle';
        this.transitionProgress = 0;
        this.notify();
        if (this.idleMode === 'still') {
          this.renderFrame(time);
          this.stopLoop();
          return;
        }
      }
    } else if (this.state === 'thinking') {
      this.transitionProgress = 1;
    } else {
      // idle
      this.transitionProgress = 0;
      if (this.idleMode === 'still') {
        this.renderFrame(time);
        this.stopLoop();
        return;
      }
    }

    // Determine current effective motion velocity
    // When idle with ambient mode: very slow breathing (0.07x speed)
    // When thinking: speed * 1.3
    const ambientMultiplier = this.idleMode === 'ambient' ? 0.08 : 0.0;
    const effectiveMotionRate =
      ambientMultiplier * (1 - this.transitionProgress) +
      this.speed * 1.25 * this.transitionProgress;

    // Continuous integration: phase increases continuously with NO resets
    this.accumulatedPhase = (this.accumulatedPhase + dt * effectiveMotionRate * 2.2) % (Math.PI * 4000);

    this.renderFrame(time);

    this.rafId = requestAnimationFrame(this.tick);
  };

  public updateCanvasResolution() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(64, Math.round((rect.width || 384) * dpr));
    const h = Math.max(64, Math.round((rect.height || 384) * dpr));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.generateGrainBuffers(w, h);
    }
  }

  private generateGrainBuffers(w: number, h: number) {
    const dimKey = `${w}x${h}`;
    if (this.cachedGrainDims === dimKey && this.grainFineCanvas && this.grainMedCanvas) {
      return;
    }

    const fine = document.createElement('canvas');
    fine.width = w;
    fine.height = h;
    fine.getContext('2d')?.putImageData(generateFineGrain(w, h), 0, 0);

    const med = document.createElement('canvas');
    med.width = w;
    med.height = h;
    const rawMed = document.createElement('canvas');
    rawMed.width = w;
    rawMed.height = h;
    rawMed.getContext('2d')?.putImageData(generateMediumGrain(w, h), 0, 0);

    const medCtx = med.getContext('2d');
    if (medCtx) {
      const blurPx = Math.max(0.5, (Math.max(w, h) / 1920) * 0.55).toFixed(2);
      medCtx.filter = `blur(${blurPx}px)`;
      medCtx.drawImage(rawMed, 0, 0);
      medCtx.filter = 'none';
    }

    this.grainFineCanvas = fine;
    this.grainMedCanvas = med;
    this.cachedGrainDims = dimKey;
  }

  public renderFrame(time: number) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 0 || h <= 0) return;

    // Clear background
    if (this.transparentBg) {
      ctx.clearRect(0, 0, w, h);
    } else {
      ctx.fillStyle = BASE_VISUAL_CONFIG.bgColor;
      ctx.fillRect(0, 0, w, h);
    }

    // Dynamic animation parameters based on continuous time and transition progress
    const activeFactor = this.transitionProgress; // 0 to 1
    const dynIntensity = (0.35 + 0.65 * activeFactor) * this.intensity;
    const tSec = (time - this.startTime) / 1000;

    // Continuous time-based phase (NO snapping, seamlessly periodic)
    const wavePhase = this.accumulatedPhase;

    // Breathing curve exponent: deep, organic breathing
    const baseCurveExp = BASE_VISUAL_CONFIG.curveExp; // 2.455
    const breathingOffset = Math.sin(tSec * this.speed * 1.1) * 0.42 * activeFactor * dynIntensity;
    const dynCurveExp = Math.max(0.8, baseCurveExp + breathingOffset);

    // Subtle min depth oscillation
    const baseDepth = BASE_VISUAL_CONFIG.depth; // 0.058
    const depthBreathing = (Math.sin(tSec * this.speed * 0.8) * 0.025 + 0.01) * activeFactor * dynIntensity;
    const dynMinDepth = Math.max(0.01, baseDepth + depthBreathing);

    // Dynamic Hue Rotation: subtle cosmic drift while thinking
    const baseHueRotate = BASE_VISUAL_CONFIG.hueRotate;
    const dynHueRotate = (baseHueRotate + (this.accumulatedPhase * 8 * activeFactor * dynIntensity)) % 360;

    // Dynamic inner radius pulse
    const baseInnerRadius = BASE_VISUAL_CONFIG.innerRadius; // 0.3567
    const dynInnerRadius = baseInnerRadius + Math.sin(tSec * this.speed * 0.95) * 0.016 * activeFactor * dynIntensity;

    // 3D tactile relief dynamics
    const baseDepth3d = BASE_VISUAL_CONFIG.depth3d; // 1.118
    const dynDepth3d = baseDepth3d + Math.sin(tSec * this.speed * 1.4) * 0.15 * activeFactor * dynIntensity;

    // Render radial bars
    this.renderRadialBars(w, h, {
      count: BASE_VISUAL_CONFIG.count,
      waveFreq: BASE_VISUAL_CONFIG.waveFreq,
      phaseOffset: wavePhase,
      curveExp: dynCurveExp,
      minDepth: dynMinDepth,
      innerRadius: dynInnerRadius,
      margin: BASE_VISUAL_CONFIG.margin,
      direction: BASE_VISUAL_CONFIG.direction,
      hueRotate: dynHueRotate,
      hueDrift: BASE_VISUAL_CONFIG.hueDrift,
      shadow: BASE_VISUAL_CONFIG.shadow,
      depth3d: dynDepth3d,
      seam: BASE_VISUAL_CONFIG.seam,
    });

    // Grain overlay
    this.renderGrain(w, h, BASE_VISUAL_CONFIG.grainIntensity);
  }

  private renderRadialBars(
    w: number,
    h: number,
    params: {
      count: number;
      waveFreq: number;
      phaseOffset: number;
      curveExp: number;
      minDepth: number;
      innerRadius: number;
      margin: number;
      direction: string;
      hueRotate: number;
      hueDrift: number;
      shadow: number;
      depth3d: number;
      seam: number;
    }
  ) {
    const ctx = this.ctx;
    const count = params.count; // 21
    const N = Math.max(1, count - 1);

    // Compute bar heights based on continuous wave function
    const heights = new Array<number>(count);
    const maxH = 1.08;
    for (let i = 0; i < count; i++) {
      const u = i / N;
      const cosVal = (1 + Math.cos(2 * Math.PI * params.waveFreq * u - params.phaseOffset)) / 2;
      heights[i] = params.minDepth + (maxH - params.minDepth) * Math.pow(cosVal, params.curveExp);
    }

    // Geometry calculations
    const minDim = Math.min(w, h);
    const marginPx = params.margin * minDim;
    const outerRadius = minDim / 2 - marginPx;
    if (outerRadius <= 4) return;

    const innerRadius = Math.max(0, Math.min(0.95, params.innerRadius)) * outerRadius;
    const ringSpan = outerRadius - innerRadius;
    const cx = w / 2;
    const cy = h / 2;

    const baseAngle = DIRECTION_ANGLES[params.direction] ?? (-3 * Math.PI) / 4;
    const sweepRad = 2 * Math.PI; // 360 deg
    const sliceRad = sweepRad / count;

    // Color ramp across the ring
    const colorRamp = buildColorTable(BASE_VISUAL_CONFIG.stops, params.hueRotate);

    // Offscreen buffer for crisp bar compositing
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');
    if (!octx) return;

    // 1. Draw bars
    for (let i = 0; i < count; i++) {
      const barH = Math.min(1, heights[i]) * ringSpan;
      if (barH < 0.5) continue;

      const r0 = innerRadius;
      const r1 = innerRadius + barH;
      const a0 = baseAngle + i * sliceRad;
      const a1 = baseAngle + (i + 1) * sliceRad;

      // Color from OKLab stop table across the ring
      const tNorm = count > 1 ? i / (count - 1) : 0.5;
      const sampleColor = sampleTable(colorRamp, tNorm);

      // Hue drift across ring
      const drift = params.hueDrift * (0.5 - Math.abs(2 * (i / count) - 1));
      const finalRgb = oklabHueRotate(sampleColor, drift);
      octx.fillStyle = formatRgb(finalRgb);

      octx.beginPath();
      octx.arc(cx, cy, r1, a0, a1, false);
      octx.arc(cx, cy, r0, a1, a0, true);
      octx.closePath();
      octx.fill();
    }

    // 2. 3D Relief & Seam shading
    octx.globalCompositeOperation = 'source-atop';

    // Top edge shadow (darkening towards outer edge of each bar)
    const shadowDepthPx = 120 * (minDim / 800);
    if (params.shadow > 0 && shadowDepthPx > 0) {
      for (let i = 0; i < count; i++) {
        const barH = Math.min(1, heights[i]) * ringSpan;
        const shadowPx = Math.min(shadowDepthPx, barH * 0.5);
        if (shadowPx <= 1) continue;

        const r1 = innerRadius + barH;
        const r0_shadow = Math.max(0, r1 - shadowPx);
        const a0 = baseAngle + i * sliceRad;
        const a1 = baseAngle + (i + 1) * sliceRad;

        const grad = octx.createRadialGradient(cx, cy, r0_shadow, cx, cy, r1);
        RADIAL_SHADOW_RAMP.forEach(([stop, alpha]) => {
          grad.addColorStop(1 - stop, `rgba(0,0,0,${alpha * params.shadow})`);
        });

        octx.save();
        octx.beginPath();
        octx.arc(cx, cy, r1, a0, a1, false);
        octx.arc(cx, cy, innerRadius, a1, a0, true);
        octx.closePath();
        octx.clip();
        octx.fillStyle = grad;
        octx.fillRect(0, 0, w, h);
        octx.restore();
      }
    }

    // Side seam / depth lines between adjacent bars
    const seamStrength = Math.min(1, params.seam);
    const sideLinePx = 9 * (minDim / 800);
    if (seamStrength > 0 && sideLinePx > 0) {
      for (let i = 0; i < count; i++) {
        const prevIdx = (i - 1 + count) % count;
        const h0 = Math.min(1, heights[prevIdx]);
        const h1 = Math.min(1, heights[i]);
        if (Math.abs(h0 - h1) < 0.002) continue;

        const minBarH = Math.min(h0, h1) * ringSpan;
        if (minBarH <= 2) continue;

        const higherIdx = h0 > h1 ? prevIdx : i;
        const stepAngle = baseAngle + i * sliceRad;

        octx.save();
        // Clip to the step transition
        const barH = Math.min(1, heights[higherIdx]) * ringSpan;
        octx.beginPath();
        octx.arc(cx, cy, innerRadius + barH, baseAngle + higherIdx * sliceRad, baseAngle + (higherIdx + 1) * sliceRad);
        octx.arc(cx, cy, innerRadius, baseAngle + (higherIdx + 1) * sliceRad, baseAngle + higherIdx * sliceRad, true);
        octx.closePath();
        octx.clip();

        // Draw shadow line along seam boundary
        octx.translate(cx, cy);
        octx.rotate(stepAngle);
        const seamGrad = octx.createLinearGradient(0, 0, sideLinePx, 0);
        seamGrad.addColorStop(0, `rgba(0,0,0,${seamStrength * 0.95})`);
        seamGrad.addColorStop(0.35, `rgba(0,0,0,${seamStrength * 0.4})`);
        seamGrad.addColorStop(1, 'rgba(0,0,0,0)');
        octx.fillStyle = seamGrad;
        octx.fillRect(0, innerRadius, sideLinePx, minBarH);
        octx.restore();
      }
    }

    // Blend onto main canvas
    octx.globalCompositeOperation = 'source-over';
    ctx.drawImage(offscreen, 0, 0);
  }

  private renderGrain(w: number, h: number, intensity: number) {
    if (intensity <= 0 || !this.grainFineCanvas || !this.grainMedCanvas) return;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = intensity * 0.95;
    ctx.drawImage(this.grainMedCanvas, 0, 0, w, h);

    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = intensity * 0.3;
    ctx.drawImage(this.grainFineCanvas, 0, 0, w, h);
    ctx.restore();
  }

  public destroy() {
    this.stopLoop();
    this.listeners.clear();
  }
}

// Global Registry & Window API exposure
declare global {
  interface Window {
    startThinkingAnimation: (options?: { speed?: number; intensity?: number }) => void;
    stopThinkingAnimation: (options?: StopThinkingOptions) => void;
    setThinkingSpeed: (speed: number) => void;
    setThinkingIntensity: (intensity: number) => void;
    isThinkingAnimationActive: () => boolean;
    getThinkingAnimationState: () => ThinkingState;
    __aiThinkingController?: AiThinkingAnimationController;
  }
}

export function registerGlobalThinkingApi(controller: AiThinkingAnimationController) {
  window.__aiThinkingController = controller;

  window.startThinkingAnimation = (options) => {
    window.__aiThinkingController?.start(options);
  };

  window.stopThinkingAnimation = (options) => {
    window.__aiThinkingController?.stop(options);
  };

  window.setThinkingSpeed = (speed) => {
    window.__aiThinkingController?.setSpeed(speed);
  };

  window.setThinkingIntensity = (intensity) => {
    window.__aiThinkingController?.setIntensity(intensity);
  };

  window.isThinkingAnimationActive = () => {
    return window.__aiThinkingController?.getIsThinking() ?? false;
  };

  window.getThinkingAnimationState = () => {
    return window.__aiThinkingController?.getState() ?? 'idle';
  };
}

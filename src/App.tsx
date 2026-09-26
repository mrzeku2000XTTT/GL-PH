/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  Sparkles,
  Sliders,
  Code2,
  Copy,
  Check,
  Zap,
  Clock,
  Layers,
  Send,
  Eye,
  Activity,
  Maximize2,
  Film
} from 'lucide-react';
import AiThinkingAnimation from './components/AiThinkingAnimation';
import SpriteMotionStudio from './components/SpriteMotionStudio';
import { callAI } from './services/aiService';
import { ThinkingState } from './animation/aiThinkingEngine';

export default function App() {
  // App view mode: 'sprite_motion' (requested new feature) vs 'ai_thinking' (existing engine)
  const [activeStudioMode, setActiveStudioMode] = useState<'sprite_motion' | 'ai_thinking'>('sprite_motion');

  // Main AI thinking animation state
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1.0);
  const [intensity, setIntensity] = useState<number>(1.0);
  const [idleMode, setIdleMode] = useState<'ambient' | 'still'>('ambient');
  const [sizeMode, setSizeMode] = useState<'small' | 'medium' | 'large'>('medium');
  const [transparentBg, setTransparentBg] = useState<boolean>(false);
  const [currentEngineState, setCurrentEngineState] = useState<ThinkingState>('idle');

  // Elapsed thinking timer
  const [thinkingSeconds, setThinkingSeconds] = useState<number>(0);
  const timerRef = useRef<number | null>(null);

  // AI Prompt testing state
  const [aiPrompt, setAiPrompt] = useState<string>('Synthesize multi-modal reasoning pipeline and architectural constraints');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [copiedCodeTab, setCopiedCodeTab] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'controls' | 'ask_ai' | 'embed_code' | 'multi_preview'>('controls');

  // Track elapsed thinking time smoothly
  useEffect(() => {
    if (isThinking) {
      setThinkingSeconds(0);
      const start = performance.now();
      timerRef.current = window.setInterval(() => {
        setThinkingSeconds((performance.now() - start) / 1000);
      }, 50);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isThinking]);

  // Handlers for Global API & Testing buttons
  const handleStartThinking = (customOptions?: { speed?: number; intensity?: number }) => {
    setIsThinking(true);
    if (window.startThinkingAnimation) {
      window.startThinkingAnimation({
        speed: customOptions?.speed ?? speed,
        intensity: customOptions?.intensity ?? intensity,
      });
    }
  };

  const handleStopThinking = (immediate = false) => {
    setIsThinking(false);
    if (window.stopThinkingAnimation) {
      window.stopThinkingAnimation({ immediate });
    }
  };

  const runAskAiRequest = async (promptText: string, simulatedDurationMs?: number) => {
    if (isAiLoading) return;
    setIsAiLoading(true);
    setAiResponse(null);

    // 1. Start thinking animation
    handleStartThinking();

    try {
      // 2. Call AI
      const response = await callAI(promptText, { simulatedDurationMs });
      setAiResponse(response);
    } catch (err: any) {
      setAiResponse(`Error: ${err?.message || 'Failed to complete AI request.'}`);
    } finally {
      // 3. Gracefully stop thinking animation when finished
      handleStopThinking();
      setIsAiLoading(false);
    }
  };

  const copyToClipboard = (text: string, tabId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeTab(tabId);
    setTimeout(() => setCopiedCodeTab(null), 2000);
  };

  // Embed code templates
  const vanillaJsCode = `<!-- 1. Include Container in your HTML -->
<div id="ai-thinking-animation"></div>

<!-- 2. Reusable AI Thinking API -->
<script type="module">
  import { AiThinkingAnimationController, registerGlobalThinkingApi } from './aiThinkingEngine.js';

  const container = document.getElementById('ai-thinking-animation');
  const canvas = document.createElement('canvas');
  canvas.style.width = '256px';
  canvas.style.height = '256px';
  container.appendChild(canvas);

  const controller = new AiThinkingAnimationController(canvas, {
    speed: 1.0,
    intensity: 1.0,
    idleMode: 'ambient'
  });
  registerGlobalThinkingApi(controller);

  async function askAI(prompt) {
    window.startThinkingAnimation({ speed: 1.0, intensity: 1.0 });
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      return await response.json();
    } finally {
      window.stopThinkingAnimation();
    }
  }
</script>`;

  const reactComponentCode = `import React, { useState } from 'react';
import { AiThinkingAnimation } from './components/AiThinkingAnimation';

export function AgentScreen() {
  const [isThinking, setIsThinking] = useState(false);

  const handleQuery = async (prompt) => {
    setIsThinking(true);
    try {
      const data = await callAiBackend(prompt);
      return data;
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="flex flex-col items-center p-8 bg-black min-h-screen">
      <AiThinkingAnimation
        size="medium" // 'small' (96px) | 'medium' (256px) | 'large' (420px)
        isThinking={isThinking}
        speed={1.0}
        intensity={1.0}
        idleMode="ambient"
        thinkingLabel="Thinking..."
      />
    </div>
  );
}`;

  return (
    <div className="min-h-screen bg-[#070707] text-[#ececec] flex flex-col font-['Geist',sans-serif]">
      {/* Top Main Navigation Bar */}
      <header className="h-12 border-b border-[#1e1e1e] px-4 sm:px-6 flex items-center justify-between bg-[#0a0a0a]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1ff2e1] shadow-[0_0_8px_#1ff2e1]" />
          <span className="font-semibold text-xs tracking-wider uppercase text-[#ececec]">
            Gradientool Studio
          </span>
          <span className="text-[#5d5d5d] text-xs font-normal">/</span>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-[#141414] p-0.5 rounded-lg border border-[#222]">
            <button
              onClick={() => setActiveStudioMode('sprite_motion')}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeStudioMode === 'sprite_motion'
                  ? 'bg-[#1ff2e1] text-black font-semibold shadow-[0_0_12px_rgba(31,242,225,0.4)]'
                  : 'text-[#9b9b9b] hover:text-[#ececec]'
              }`}
            >
              <Film size={12} />
              <span>Sprite Motion</span>
            </button>

            <button
              onClick={() => setActiveStudioMode('ai_thinking')}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeStudioMode === 'ai_thinking'
                  ? 'bg-[#1ff2e1] text-black font-semibold shadow-[0_0_12px_rgba(31,242,225,0.4)]'
                  : 'text-[#9b9b9b] hover:text-[#ececec]'
              }`}
            >
              <Sparkles size={12} />
              <span>AI Thinking Visual</span>
            </button>
          </div>
        </div>

        {/* Header Right Status */}
        <div className="flex items-center gap-2 sm:gap-4">
          {activeStudioMode === 'ai_thinking' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161616] border border-[#2a2a2a] text-[10px] font-['JetBrains_Mono']">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isThinking
                    ? 'bg-[#1ff2e1] animate-pulse'
                    : idleMode === 'ambient'
                    ? 'bg-[#9c5fef]'
                    : 'bg-[#5d5d5d]'
                }`}
              />
              <span className="text-[#9b9b9b] uppercase">{currentEngineState}</span>
              {isThinking && (
                <span className="text-[#1ff2e1] ml-1 font-semibold">
                  {thinkingSeconds.toFixed(1)}s
                </span>
              )}
            </div>
          )}

          {activeStudioMode === 'ai_thinking' && (
            <button
              onClick={() => setActiveTab('embed_code')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#161616] hover:bg-[#202020] text-xs font-medium text-[#ececec] border border-[#2a2a2a] transition-colors cursor-pointer"
            >
              <Code2 size={13} className="text-[#1ff2e1]" />
              <span>Embed Code</span>
            </button>
          )}
        </div>
      </header>

      {/* RENDER ACTIVE MODE */}
      {activeStudioMode === 'sprite_motion' ? (
        <SpriteMotionStudio />
      ) : (
        /* AI Thinking Visual Stage Area */
        <div className="flex-1 flex flex-col lg:flex-row">
          {/* Visual Stage Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative min-h-[460px] bg-[#070707] overflow-hidden border-b lg:border-b-0 lg:border-r border-[#1e1e1e]">
            {/* Ambient Background radial glow */}
            <div className="absolute inset-0 pointer-events-none opacity-20 flex items-center justify-center">
              <div
                className={`w-[600px] h-[600px] rounded-full blur-[140px] transition-all duration-1000 ${
                  isThinking
                    ? 'bg-gradient-to-tr from-[#1ff2e1]/30 via-[#9c5fef]/20 to-transparent scale-110'
                    : 'bg-[#1ff2e1]/10 scale-90'
                }`}
              />
            </div>

            {/* Central Visual Component */}
            <div className="relative z-10 flex flex-col items-center justify-center">
              <AiThinkingAnimation
                id="ai-thinking-animation"
                size={sizeMode}
                isThinking={isThinking}
                speed={speed}
                intensity={intensity}
                idleMode={idleMode}
                transparentBg={transparentBg}
                showStatusText={true}
                thinkingLabel="Thinking..."
                idleLabel={idleMode === 'ambient' ? 'Ambient Standby' : 'Ready'}
                onStateChange={(st) => setCurrentEngineState(st)}
                className="transition-all duration-300"
              />
            </div>

            {/* Test Controls Action Bar */}
            <div className="relative z-20 mt-10 flex flex-wrap items-center justify-center gap-3">
              {!isThinking ? (
                <button
                  onClick={() => handleStartThinking()}
                  className="group flex items-center gap-2 px-6 py-2.5 rounded bg-[#ececec] hover:bg-white text-black font-semibold text-xs tracking-wider uppercase transition-all shadow-[0_0_24px_rgba(31,242,225,0.35)] hover:shadow-[0_0_32px_rgba(31,242,225,0.6)] cursor-pointer active:scale-[0.98]"
                >
                  <Play size={14} className="fill-black text-black group-hover:scale-110 transition-transform" />
                  <span>Start Thinking</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStopThinking(false)}
                    className="flex items-center gap-2 px-6 py-2.5 rounded bg-[#161616] hover:bg-[#222222] text-[#ececec] hover:text-white font-semibold text-xs tracking-wider uppercase border border-[#2a2a2a] hover:border-[#1ff2e1]/50 transition-all cursor-pointer active:scale-[0.98]"
                    title="Smooth exit transition (approx 350ms)"
                  >
                    <Square size={13} className="fill-current text-[#1ff2e1]" />
                    <span>Stop Thinking</span>
                  </button>

                  <button
                    onClick={() => handleStopThinking(true)}
                    className="px-3 py-2.5 rounded bg-[#161616] hover:bg-[#202020] text-[#9b9b9b] hover:text-[#ececec] text-xs font-mono border border-[#2a2a2a] transition-all cursor-pointer"
                    title="Stop immediately without exit easing"
                  >
                    Immediate
                  </button>
                </div>
              )}
            </div>

            {/* Continuous Loop Indicator */}
            <div className="mt-6 flex items-center gap-2 text-[11px] text-[#5d5d5d] font-['JetBrains_Mono']">
              <Activity size={12} className={isThinking ? 'text-[#1ff2e1] animate-pulse' : 'text-[#5d5d5d]'} />
              <span>
                {isThinking
                  ? `Active continuous integration: ${thinkingSeconds.toFixed(1)}s (no timeline loop)`
                  : idleMode === 'ambient'
                  ? 'Ambient breath mode: 0.08x resting phase'
                  : 'Still mode: 0% CPU consumption'}
              </span>
            </div>
          </div>

          {/* Right Interactive Sidebar & Configuration Panel */}
          <aside className="w-full lg:w-[440px] xl:w-[480px] bg-[#0d0d0d] flex flex-col border-t lg:border-t-0">
            {/* Navigation Tabs */}
            <div className="flex border-b border-[#1e1e1e] bg-[#0a0a0a]">
              <button
                onClick={() => setActiveTab('controls')}
                className={`flex-1 py-3 px-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'controls'
                    ? 'border-[#1ff2e1] text-[#ececec] bg-[#161616]/40'
                    : 'border-transparent text-[#9b9b9b] hover:text-[#ececec]'
                }`}
              >
                <Sliders size={13} />
                <span>Controls</span>
              </button>

              <button
                onClick={() => setActiveTab('ask_ai')}
                className={`flex-1 py-3 px-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'ask_ai'
                    ? 'border-[#1ff2e1] text-[#ececec] bg-[#161616]/40'
                    : 'border-transparent text-[#9b9b9b] hover:text-[#ececec]'
                }`}
              >
                <Sparkles size={13} className="text-[#1ff2e1]" />
                <span>AI Integration</span>
              </button>

              <button
                onClick={() => setActiveTab('multi_preview')}
                className={`flex-1 py-3 px-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'multi_preview'
                    ? 'border-[#1ff2e1] text-[#ececec] bg-[#161616]/40'
                    : 'border-transparent text-[#9b9b9b] hover:text-[#ececec]'
                }`}
              >
                <Layers size={13} />
                <span>Sizes</span>
              </button>

              <button
                onClick={() => setActiveTab('embed_code')}
                className={`flex-1 py-3 px-3 text-xs font-medium flex items-center justify-center gap-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'embed_code'
                    ? 'border-[#1ff2e1] text-[#ececec] bg-[#161616]/40'
                    : 'border-transparent text-[#9b9b9b] hover:text-[#ececec]'
                }`}
              >
                <Code2 size={13} />
                <span>Code</span>
              </button>
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
              {/* TAB 1: CONTROLS */}
              {activeTab === 'controls' && (
                <div className="space-y-6">
                  {/* Speed Setting */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[#9b9b9b] uppercase font-semibold tracking-wider text-[10px]">
                        Thinking Speed
                      </label>
                      <span className="font-mono text-[#ececec]">{speed.toFixed(2)}x</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { val: 0.5, label: '0.5x Subtle' },
                        { val: 1.0, label: '1.0x Normal' },
                        { val: 1.5, label: '1.5x Lively' },
                        { val: 2.0, label: '2.0x Fast' },
                      ].map((item) => (
                        <button
                          key={item.val}
                          onClick={() => {
                            setSpeed(item.val);
                            window.setThinkingSpeed?.(item.val);
                          }}
                          className={`py-1.5 px-2 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                            speed === item.val
                              ? 'bg-[#2a2a2a] text-[#ececec] border-[#1ff2e1]/50'
                              : 'bg-[#161616] text-[#9b9b9b] border-[#1e1e1e] hover:bg-[#202020]'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="2.5"
                      step="0.05"
                      value={speed}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setSpeed(v);
                        window.setThinkingSpeed?.(v);
                      }}
                      className="w-full accent-[#1ff2e1] cursor-pointer"
                    />
                  </div>

                  {/* Intensity Setting */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[#9b9b9b] uppercase font-semibold tracking-wider text-[10px]">
                        Wave Intensity & Breathing
                      </label>
                      <span className="font-mono text-[#ececec]">{intensity.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { val: 0.5, label: '0.5 Gentle' },
                        { val: 1.0, label: '1.0 Standard' },
                        { val: 1.5, label: '1.5 Dynamic' },
                        { val: 2.0, label: '2.0 High' },
                      ].map((item) => (
                        <button
                          key={item.val}
                          onClick={() => {
                            setIntensity(item.val);
                            window.setThinkingIntensity?.(item.val);
                          }}
                          className={`py-1.5 px-2 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                            intensity === item.val
                              ? 'bg-[#2a2a2a] text-[#ececec] border-[#1ff2e1]/50'
                              : 'bg-[#161616] text-[#9b9b9b] border-[#1e1e1e] hover:bg-[#202020]'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0.3"
                      max="2.5"
                      step="0.05"
                      value={intensity}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setIntensity(v);
                        window.setThinkingIntensity?.(v);
                      }}
                      className="w-full accent-[#1ff2e1] cursor-pointer"
                    />
                  </div>

                  {/* Size Selector */}
                  <div className="space-y-2">
                    <label className="text-[#9b9b9b] uppercase font-semibold tracking-wider text-[10px]">
                      Component Dimension
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'small', label: 'Small (96px)', desc: 'Chat / Inline' },
                        { key: 'medium', label: 'Medium (256px)', desc: 'Card / Modal' },
                        { key: 'large', label: 'Large (420px)', desc: 'Hero Canvas' },
                      ].map((item) => (
                        <button
                          key={item.key}
                          onClick={() => setSizeMode(item.key as any)}
                          className={`p-2 rounded text-left border transition-all cursor-pointer ${
                            sizeMode === item.key
                              ? 'bg-[#1e1e1e] border-[#1ff2e1] text-[#ececec]'
                              : 'bg-[#161616] border-[#222222] text-[#9b9b9b] hover:bg-[#202020]'
                          }`}
                        >
                          <div className="font-medium text-xs text-[#ececec]">{item.label}</div>
                          <div className="text-[10px] text-[#5d5d5d]">{item.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Idle Mode Setting */}
                  <div className="space-y-2">
                    <label className="text-[#9b9b9b] uppercase font-semibold tracking-wider text-[10px]">
                      Idle Rest State
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setIdleMode('ambient')}
                        className={`p-2.5 rounded border text-left cursor-pointer transition-colors ${
                          idleMode === 'ambient'
                            ? 'bg-[#1e1e1e] border-[#1ff2e1]/70 text-[#ececec]'
                            : 'bg-[#161616] border-[#222] text-[#9b9b9b] hover:bg-[#202020]'
                        }`}
                      >
                        <div className="font-medium text-xs">Ambient Breathing</div>
                        <div className="text-[10px] text-[#5d5d5d] mt-0.5">
                          Ultra-slow peaceful drift (0.08x rate)
                        </div>
                      </button>

                      <button
                        onClick={() => setIdleMode('still')}
                        className={`p-2.5 rounded border text-left cursor-pointer transition-colors ${
                          idleMode === 'still'
                            ? 'bg-[#1e1e1e] border-[#1ff2e1]/70 text-[#ececec]'
                            : 'bg-[#161616] border-[#222] text-[#9b9b9b] hover:bg-[#202020]'
                        }`}
                      >
                        <div className="font-medium text-xs">Completely Still</div>
                        <div className="text-[10px] text-[#5d5d5d] mt-0.5">
                          Pauses rAF loop when idle (0% CPU)
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Transparency Toggle */}
                  <div className="pt-2 border-t border-[#1e1e1e] flex items-center justify-between">
                    <div>
                      <div className="font-medium text-[#ececec]">Transparent Background</div>
                      <div className="text-[10px] text-[#5d5d5d]">
                        Enables embedding into non-black cards
                      </div>
                    </div>
                    <button
                      onClick={() => setTransparentBg(!transparentBg)}
                      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                        transparentBg ? 'bg-[#1ff2e1]' : 'bg-[#2a2a2a]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-black absolute top-1 transition-transform ${
                          transparentBg ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Visual Architecture Info Card */}
                  <div className="p-3.5 rounded bg-[#141414] border border-[#222] space-y-1.5 font-['JetBrains_Mono'] text-[11px]">
                    <div className="text-[#1ff2e1] font-semibold flex items-center gap-1.5">
                      <Sparkles size={12} />
                      <span>Exact Visual Engine Parameters</span>
                    </div>
                    <div className="text-[#9b9b9b] leading-relaxed">
                      • Wave Frequency: 2 Peaks Radial (360° Closed Loop)<br />
                      • Color Space: Perceptual OKLab Gradient Mapping<br />
                      • Dynamic Phase: (elapsed × speed) with zero snaps<br />
                      • Tactical 3D Relief: Seam Shadows + Velocity Grain
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: AI INTEGRATION */}
              {activeTab === 'ask_ai' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#ececec]">
                      Simulated & Real AI Testing
                    </h3>
                    <p className="text-[11px] text-[#9b9b9b] mt-1 leading-relaxed">
                      Tests the indeterminate execution time model where the AI request controls the
                      animation lifetime:
                    </p>
                  </div>

                  {/* Flow Diagram */}
                  <div className="p-3 rounded bg-[#141414] border border-[#222] font-mono text-[10px] text-[#9b9b9b] leading-tight">
                    <div className="text-[#1ff2e1]">AI Starts Thinking</div>
                    <div className="my-1 pl-3 text-[#5d5d5d]">↓ startThinkingAnimation()</div>
                    <div className="text-[#ececec]">Continuous Alive Motion (unknown duration)</div>
                    <div className="my-1 pl-3 text-[#5d5d5d]">↓ stopThinkingAnimation()</div>
                    <div className="text-[#9c5fef]">Smooth Graceful Exit to Idle State</div>
                  </div>

                  {/* Preset Time Buttons */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-semibold tracking-wider text-[#5d5d5d]">
                      Quick Simulation Tests
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        disabled={isAiLoading}
                        onClick={() => runAskAiRequest('Quick database query lookup', 2500)}
                        className="py-2 px-2.5 rounded bg-[#161616] hover:bg-[#202020] border border-[#2a2a2a] text-[#ececec] text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <div className="font-semibold">Fast Query</div>
                        <div className="text-[9px] text-[#5d5d5d]">~2.5s response</div>
                      </button>

                      <button
                        disabled={isAiLoading}
                        onClick={() => runAskAiRequest('Multi-step reasoning and deduction', 7500)}
                        className="py-2 px-2.5 rounded bg-[#161616] hover:bg-[#202020] border border-[#2a2a2a] text-[#ececec] text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <div className="font-semibold">Reasoning</div>
                        <div className="text-[9px] text-[#5d5d5d]">~7.5s response</div>
                      </button>

                      <button
                        disabled={isAiLoading}
                        onClick={() => runAskAiRequest('Deep architectural cross-synthesis', 16000)}
                        className="py-2 px-2.5 rounded bg-[#161616] hover:bg-[#202020] border border-[#2a2a2a] text-[#ececec] text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <div className="font-semibold">Deep Task</div>
                        <div className="text-[9px] text-[#5d5d5d]">~16.0s response</div>
                      </button>
                    </div>
                  </div>

                  {/* Custom Query Input */}
                  <div className="space-y-2 pt-2 border-t border-[#1e1e1e]">
                    <label className="text-[10px] uppercase font-semibold tracking-wider text-[#5d5d5d]">
                      Custom Prompt Execution
                    </label>
                    <div className="relative">
                      <textarea
                        rows={3}
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Type a prompt for the AI to process..."
                        className="w-full bg-[#161616] border border-[#2a2a2a] rounded p-2.5 text-xs text-[#ececec] focus:outline-none focus:border-[#1ff2e1] resize-none font-mono"
                      />
                    </div>

                    <button
                      disabled={isAiLoading || !aiPrompt.trim()}
                      onClick={() => runAskAiRequest(aiPrompt)}
                      className="w-full py-2.5 px-4 rounded bg-[#1ff2e1] hover:bg-[#1ff2e1]/90 text-black font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40"
                    >
                      <Send size={13} />
                      <span>{isAiLoading ? 'AI is Thinking...' : 'Execute AI Request'}</span>
                    </button>
                  </div>

                  {/* AI Response Output */}
                  {aiResponse && (
                    <div className="p-3 rounded bg-[#141414] border border-[#2a2a2a] space-y-1.5 animate-fadeIn">
                      <div className="text-[10px] uppercase tracking-wider text-[#1ff2e1] font-semibold flex items-center justify-between">
                        <span>Response Output</span>
                        <span className="text-[#5d5d5d]">Completed</span>
                      </div>
                      <pre className="text-[11px] text-[#ececec] font-sans whitespace-pre-wrap leading-relaxed">
                        {aiResponse}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: MULTI-SIZE PREVIEW */}
              {activeTab === 'multi_preview' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#ececec]">
                      Responsive Size Scalability
                    </h3>
                    <p className="text-[11px] text-[#9b9b9b] mt-1 leading-relaxed">
                      The component retains full mathematical fidelity and tactile grain across all
                      dimensions:
                    </p>
                  </div>

                  {/* Synchronized multi-size gallery */}
                  <div className="space-y-4">
                    <div className="p-4 rounded bg-[#121212] border border-[#222] flex flex-col items-center justify-center">
                      <div className="text-[10px] text-[#5d5d5d] uppercase tracking-wider mb-2 font-mono">
                        Small: 80px (Chat bubble / Navbar)
                      </div>
                      <AiThinkingAnimation
                        size={80}
                        isThinking={isThinking}
                        speed={speed}
                        intensity={intensity}
                        idleMode={idleMode}
                        showStatusText={false}
                        isPrimary={false}
                      />
                    </div>

                    <div className="p-4 rounded bg-[#121212] border border-[#222] flex flex-col items-center justify-center">
                      <div className="text-[10px] text-[#5d5d5d] uppercase tracking-wider mb-2 font-mono">
                        Medium: 160px (Sidebar / Dialog)
                      </div>
                      <AiThinkingAnimation
                        size={160}
                        isThinking={isThinking}
                        speed={speed}
                        intensity={intensity}
                        idleMode={idleMode}
                        showStatusText={false}
                        isPrimary={false}
                      />
                    </div>

                    <div className="p-4 rounded bg-[#121212] border border-[#222] flex flex-col items-center justify-center">
                      <div className="text-[10px] text-[#5d5d5d] uppercase tracking-wider mb-2 font-mono">
                        Large: 260px (Hero / Spotlight)
                      </div>
                      <AiThinkingAnimation
                        size={260}
                        isThinking={isThinking}
                        speed={speed}
                        intensity={intensity}
                        idleMode={idleMode}
                        showStatusText={false}
                        isPrimary={false}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: EMBED CODE & API */}
              {activeTab === 'embed_code' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#ececec]">
                      Developer Integration Code
                    </h3>
                    <p className="text-[11px] text-[#9b9b9b] mt-1 leading-relaxed">
                      Zero dependencies required. Use as a standalone Vanilla JS canvas controller or
                      React component:
                    </p>
                  </div>

                  {/* Vanilla JS snippet */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-semibold text-[#1ff2e1]">
                        Vanilla JS / HTML Snippet
                      </span>
                      <button
                        onClick={() => copyToClipboard(vanillaJsCode, 'vanilla')}
                        className="flex items-center gap-1 text-[10px] text-[#9b9b9b] hover:text-[#ececec] cursor-pointer"
                      >
                        {copiedCodeTab === 'vanilla' ? <Check size={12} className="text-[#1ff2e1]" /> : <Copy size={12} />}
                        <span>{copiedCodeTab === 'vanilla' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="p-3 rounded bg-[#141414] border border-[#222] font-mono text-[10px] text-[#ececec] overflow-x-auto leading-relaxed">
                      {vanillaJsCode}
                    </pre>
                  </div>

                  {/* React snippet */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono font-semibold text-[#9c5fef]">
                        React Component
                      </span>
                      <button
                        onClick={() => copyToClipboard(reactComponentCode, 'react')}
                        className="flex items-center gap-1 text-[10px] text-[#9b9b9b] hover:text-[#ececec] cursor-pointer"
                      >
                        {copiedCodeTab === 'react' ? <Check size={12} className="text-[#1ff2e1]" /> : <Copy size={12} />}
                        <span>{copiedCodeTab === 'react' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <pre className="p-3 rounded bg-[#141414] border border-[#222] font-mono text-[10px] text-[#ececec] overflow-x-auto leading-relaxed">
                      {reactComponentCode}
                    </pre>
                  </div>

                  {/* Global API Reference */}
                  <div className="p-3 rounded bg-[#141414] border border-[#222] space-y-2">
                    <span className="text-[10px] uppercase font-mono font-semibold text-[#ececec] block">
                      Global Window API Reference
                    </span>
                    <div className="font-mono text-[10px] text-[#9b9b9b] space-y-1">
                      <div><span className="text-[#1ff2e1]">window.startThinkingAnimation</span>({`{ speed?: 1, intensity?: 1 }`})</div>
                      <div><span className="text-[#1ff2e1]">window.stopThinkingAnimation</span>({`{ immediate?: false }`})</div>
                      <div><span className="text-[#1ff2e1]">window.setThinkingSpeed</span>(speed: number)</div>
                      <div><span className="text-[#1ff2e1]">window.setThinkingIntensity</span>(intensity: number)</div>
                      <div><span className="text-[#1ff2e1]">window.isThinkingAnimationActive</span>(): boolean</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}


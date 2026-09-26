import React, { useEffect, useRef, useState } from 'react';
import {
  AiThinkingAnimationController,
  registerGlobalThinkingApi,
  ThinkingState,
} from '../animation/aiThinkingEngine';

export interface AiThinkingAnimationProps {
  id?: string;
  size?: 'small' | 'medium' | 'large' | 'full' | number;
  isThinking?: boolean;
  speed?: number;
  intensity?: number;
  idleMode?: 'ambient' | 'still';
  transparentBg?: boolean;
  showStatusText?: boolean;
  thinkingLabel?: string;
  idleLabel?: string;
  className?: string;
  onStateChange?: (state: ThinkingState) => void;
  isPrimary?: boolean;
}

export const AiThinkingAnimation: React.FC<AiThinkingAnimationProps> = ({
  id = 'ai-thinking-animation',
  size = 'medium',
  isThinking = false,
  speed = 1.0,
  intensity = 1.0,
  idleMode = 'ambient',
  transparentBg = false,
  showStatusText = true,
  thinkingLabel = 'Thinking...',
  idleLabel = '',
  className = '',
  onStateChange,
  isPrimary = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<AiThinkingAnimationController | null>(null);
  const [internalState, setInternalState] = useState<ThinkingState>('idle');

  // Determine container dimensions based on size prop
  const getDimensionStyle = () => {
    if (typeof size === 'number') {
      return { width: `${size}px`, height: `${size}px` };
    }
    switch (size) {
      case 'small':
        return { width: '96px', height: '96px' };
      case 'medium':
        return { width: '256px', height: '256px' };
      case 'large':
        return { width: '420px', height: '420px' };
      case 'full':
        return { width: '100%', height: '100%' };
      default:
        return { width: '256px', height: '256px' };
    }
  };

  // Initialize Controller
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new AiThinkingAnimationController(canvas, {
      speed,
      intensity,
      idleMode,
      transparentBg,
    });
    controllerRef.current = controller;

    if (isPrimary) {
      registerGlobalThinkingApi(controller);
    }

    const unsubscribe = controller.subscribe((state) => {
      setInternalState(state);
      onStateChange?.(state);
    });

    // Handle container resize
    const resizeObserver = new ResizeObserver(() => {
      controller.updateCanvasResolution();
      controller.renderFrame(performance.now());
    });
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
      unsubscribe();
      controller.destroy();
    };
  }, []);

  // Update dynamic options
  useEffect(() => {
    controllerRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    controllerRef.current?.setIntensity(intensity);
  }, [intensity]);

  useEffect(() => {
    controllerRef.current?.setIdleMode(idleMode);
  }, [idleMode]);

  useEffect(() => {
    controllerRef.current?.setTransparentBg(transparentBg);
  }, [transparentBg]);

  // Synchronize controlled `isThinking` prop
  useEffect(() => {
    if (!controllerRef.current) return;
    if (isThinking) {
      controllerRef.current.start({ speed, intensity });
    } else {
      controllerRef.current.stop();
    }
  }, [isThinking]);

  const isActivelyThinking = internalState === 'thinking' || internalState === 'transition_in';
  const isTransitioning = internalState === 'transition_in' || internalState === 'transition_out';

  return (
    <div
      id={id}
      className={`relative flex flex-col items-center justify-center select-none ${className}`}
    >
      {/* Canvas Container */}
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-full"
        style={getDimensionStyle()}
      >
        {/* Subtle cyan/violet ambient glow around canvas while thinking */}
        <div
          className={`absolute inset-0 rounded-full blur-2xl pointer-events-none transition-opacity duration-700 ${
            isActivelyThinking ? 'opacity-30' : 'opacity-5'
          }`}
          style={{
            background: 'radial-gradient(circle, rgba(31,242,225,0.4) 0%, rgba(156,95,239,0.2) 60%, transparent 80%)',
          }}
        />

        <canvas
          ref={canvasRef}
          className="relative z-10 w-full h-full object-contain cursor-default"
        />
      </div>

      {/* Status indicator requested by user:
          "And I'd make the eventual UI simply:
                  [ YOUR AI VISUAL ]
                       Thinking...
          with no spinner, no percentage, no 'loading 37%'.
          The visual itself communicates that the AI is working."
      */}
      {showStatusText && (
        <div className="mt-4 flex flex-col items-center justify-center min-h-[28px] text-center">
          <div
            className={`font-['Geist'] text-xs font-medium tracking-[0.2em] uppercase transition-all duration-300 ${
              isActivelyThinking
                ? 'text-[#ececec] opacity-100 translate-y-0'
                : idleLabel
                ? 'text-[#5d5d5d] opacity-70 translate-y-0'
                : 'opacity-0 -translate-y-1 pointer-events-none'
            }`}
          >
            {isActivelyThinking ? thinkingLabel : idleLabel}
          </div>
          {isTransitioning && (
            <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[#1ff2e1]/60 animate-ping" />
          )}
        </div>
      )}
    </div>
  );
};
export default AiThinkingAnimation;

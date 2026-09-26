import { LiquidMetal, liquidMetalPresets } from '@paper-design/shaders-react';
import { cn } from '@/lib/utils';

export interface ShaderBackgroundProps {
  className?: string;
  shape?: 'diamond' | 'none' | 'circle' | 'daisy' | 'metaballs';
  scale?: number;
  speed?: number;
  colorTint?: string;
}

/** Liquid Metal shader backdrop with flowing chrome reflections and spectral dispersion. */
export function ShaderBackground({
  className,
  shape = 'diamond',
  scale = 0.68,
  speed = 0.65,
  colorTint = '#ffffff',
}: ShaderBackgroundProps) {
  const defaultPreset = liquidMetalPresets[0];

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-0 z-0 overflow-hidden',
        className
      )}
    >
      {/* ── 1. Liquid Metal 3D Chrome Shader ── */}
      <LiquidMetal
        {...defaultPreset.params}
        shape={shape}
        scale={scale}
        speed={speed}
        colorBack="#05070b"
        colorTint={colorTint}
        repetition={2.0}
        softness={0.08}
        shiftRed={0.35}
        shiftBlue={0.55}
        distortion={0.10}
        contour={0.42}
        angle={75}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ── 2. Subtle Neon Ambient Glow Elements ── */}
      {/* Top cyan neon aura */}
      <div
        className="absolute -top-36 left-1/2 -translate-x-1/2 w-[900px] h-[450px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(94, 240, 255, 0.12) 0%, rgba(94, 240, 255, 0.02) 50%, transparent 75%)',
          filter: 'blur(65px)',
        }}
      />
      {/* Right neon magenta bloom */}
      <div
        className="absolute top-1/4 -right-32 w-[650px] h-[520px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255, 79, 216, 0.08) 0%, rgba(255, 79, 216, 0.01) 45%, transparent 75%)',
          filter: 'blur(75px)',
        }}
      />
      {/* Bottom left neon cyan/phosphor glow */}
      <div
        className="absolute -bottom-36 -left-28 w-[750px] h-[480px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(94, 240, 255, 0.08) 0%, rgba(124, 255, 154, 0.03) 40%, transparent 75%)',
          filter: 'blur(70px)',
        }}
      />

      {/* ── 3. Subtle Neon Grid ── */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(94, 240, 255, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(94, 240, 255, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '54px 54px',
          maskImage: 'radial-gradient(ellipse 85% 75% at 50% 35%, black 25%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 75% at 50% 35%, black 25%, transparent 85%)',
        }}
      />

      {/* ── 4. Subtle Vignette for contrast ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 95% 85% at 50% 40%, transparent 45%, rgba(5, 7, 11, 0.6) 100%)',
        }}
      />
    </div>
  );
}

/** Alias kept for older imports. Prefer ShaderBackground (avoids DOM WebGLShader clash). */
export { ShaderBackground as WebGLShader };

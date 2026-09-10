import { useEffect, useState } from 'react';
import { Matrix, loader } from './matrix';

export function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'done'>('loading');
  const [levels, setLevels] = useState<number[]>(Array(15).fill(0.1));

  const basePattern = [4, 5, 5, 4, 3, 4, 4, 3, 2, 3, 4, 4, 3, 1, 2].map(h => h / 7);

  useEffect(() => {
    if (phase === 'done') return;
    let animFrameId: number;
    const startTime = Date.now();

    const update = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      setLevels(() =>
        basePattern.map((val, i) => {
          // Bounces the base shape up and down with a small wave delay across columns
          const factor = Math.sin(elapsed * 4 - i * 0.12) * 0.22 + 0.78;
          return Math.max(0.1, Math.min(1.0, val * factor));
        })
      );
      animFrameId = requestAnimationFrame(update);
    };

    animFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrameId);
  }, [phase]);

  useEffect(() => {
    const stages = [
      { target: 35, delay: 2000 },
      { target: 65, delay: 10000 },
      { target: 85, delay: 20000 },
      { target: 100, delay: 30000 },
    ];

    const timers: ReturnType<typeof setTimeout>[] = [];

    stages.forEach((stage) => {
      const t = setTimeout(() => {
        setProgress(stage.target);
        if (stage.target === 100) {
          const done = setTimeout(() => {
            setPhase('done');
            setTimeout(onComplete, 500);
          }, 200);
          timers.push(done);
        }
      }, stage.delay);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div
      className={`
        fixed inset-0 z-[9999] flex flex-col items-center justify-center
        bg-[#05070b] transition-opacity duration-500
        ${phase === 'done' ? 'opacity-0 pointer-events-none' : 'opacity-100'}
      `}
    >
      {/* CRT scanline overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `repeating-linear-gradient(
            0deg,
            rgba(0,0,0,0.13) 0px,
            rgba(0,0,0,0.13) 1px,
            transparent 1px,
            transparent 3px
          )`,
          mixBlendMode: 'multiply',
          opacity: 0.55,
        }}
      />

      {/* Ambient glow blob */}
      <div
        className="pointer-events-none absolute"
        style={{
          width: 480,
          height: 320,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(94,240,255,0.07) 0%, rgba(255,79,216,0.04) 55%, transparent 80%)',
          filter: 'blur(40px)',
          animation: 'lo-pulse 3s ease-in-out infinite',
        }}
      />

      {/* Logo + wordmark */}
      <div className="relative flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center h-24 w-52">
          <Matrix
            rows={7}
            cols={15}
            mode="vu"
            levels={levels}
            fps={16}
            size={8}
            gap={3}
            palette={{
              on: '#5ef0ff',
              off: 'rgba(255,255,255,0.03)',
            }}
          />
        </div>

        <div className="flex flex-col items-center gap-1">
          <span
            className="font-semibold tracking-tight text-white text-xl"
            style={{ textShadow: '0 0 18px rgba(94,240,255,0.3), 0 0 40px rgba(255,79,216,0.12)' }}
          >
            AgentOps
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-[#5ef0ff] opacity-70">
            Initializing
          </span>
        </div>
      </div>

      <style>{`
        @keyframes lo-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }
        @keyframes lo-beat {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.06); }
        }
        @keyframes lo-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes lo-spin-rev {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}

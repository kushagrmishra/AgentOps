import { useEffect, useState } from 'react';
import UniqueLoading from './morph-loading';
import { TextScramble } from '@/components/core/text-scramble';

export function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'done'>('loading');

  useEffect(() => {
    // Progress ticks over 30 seconds: reach 100% at ~29s, then fade out
    const stages = [
      { target: 10, delay: 2000 },
      { target: 22, delay: 5000 },
      { target: 38, delay: 9000 },
      { target: 55, delay: 13000 },
      { target: 70, delay: 17000 },
      { target: 83, delay: 21000 },
      { target: 93, delay: 25000 },
      { target: 100, delay: 29000 },
    ];

    const timers: ReturnType<typeof setTimeout>[] = [];

    stages.forEach((stage) => {
      const t = setTimeout(() => {
        setProgress(stage.target);
        if (stage.target === 100) {
          const done = setTimeout(() => {
            setPhase('done');
            setTimeout(onComplete, 500);
          }, 500);
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
        bg-black transition-opacity duration-500
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

      {/* Logo + wordmark */}
      <div className="relative flex flex-col items-center gap-8">
        <div className="relative flex items-center justify-center h-28 w-28">
          <UniqueLoading variant="morph" size="md" scale={1.2} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <TextScramble
            as="span"
            key={progress}
            duration={0.9}
            speed={0.03}
            characterSet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
            className="font-logo font-semibold tracking-tight text-white text-4xl sm:text-5xl"
          >
            AgenticX
          </TextScramble>
          <span className="font-mono text-xs sm:text-sm uppercase tracking-[0.28em] text-[#5ef0ff]">
            Initializing
          </span>
        </div>
      </div>
    </div>
  );
}

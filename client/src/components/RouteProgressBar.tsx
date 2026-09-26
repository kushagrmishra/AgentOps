import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export function RouteProgressBar() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setVisible(true);
    setProgress(18);

    const t1 = setTimeout(() => setProgress(55), 45);
    const t2 = setTimeout(() => setProgress(82), 110);
    const t3 = setTimeout(() => setProgress(96), 180);
    const t4 = setTimeout(() => setProgress(100), 240);
    const t5 = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [location.pathname, location.search]);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 right-0 z-[99999] h-[3px] overflow-hidden bg-transparent"
    >
      <div
        className="relative h-full bg-gradient-to-r from-transparent via-[var(--spectre-cyan,#5ef0ff)] to-[var(--spectre-pink,#ff4fd8)] transition-all ease-out"
        style={{
          width: `${progress}%`,
          transitionDuration: progress === 100 ? '140ms' : '170ms',
          opacity: progress === 100 ? 0 : 1,
          boxShadow: '0 0 16px rgba(94, 240, 255, 0.95), 0 0 28px rgba(255, 79, 216, 0.7)',
        }}
      >
        {/* Glowing laser tip spark */}
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 h-2.5 w-6 -mr-1 rounded-full bg-white/90 blur-[1px]"
          style={{
            boxShadow: '0 0 10px #ffffff, 0 0 18px var(--spectre-cyan,#5ef0ff)',
          }}
        />
      </div>
    </div>
  );
}


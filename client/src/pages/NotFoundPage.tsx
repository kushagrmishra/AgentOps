import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import UniqueLoading from '../components/ui/morph-loading';
import { WebGLShader } from '../components/WebGLShader';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="spectre-shell relative flex min-h-screen flex-col items-center justify-center text-fg overflow-hidden">
      <WebGLShader className="opacity-70" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center gap-8 text-center px-6"
      >
        {/* Morph loader as visual anchor */}
        <UniqueLoading variant="morph" size="lg" />

        {/* Error code */}
        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-[#5ef0ff] opacity-60">
            Error Code
          </span>
          <motion.h1
            className="font-mono text-[8rem] font-black leading-none tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #ffffff 30%, #5ef0ff 70%, #ff4fd8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: 'none',
            }}
            animate={{ opacity: [1, 0.85, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            404
          </motion.h1>
          <p className="font-mono text-sm text-white/50 tracking-wider">
            PAGE NOT FOUND
          </p>
        </div>

        {/* Terminal-style message block */}
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left font-mono text-xs">
          <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
            <span className="h-2 w-2 rounded-full bg-red-500/80" />
            <span className="h-2 w-2 rounded-full bg-yellow-500/80" />
            <span className="h-2 w-2 rounded-full bg-green-500/80" />
            <span className="ml-2 text-white/30 text-2xs">agenticx — shell</span>
          </div>
          <div className="space-y-1.5 text-white/60">
            <p>
              <span className="text-[#5ef0ff]">$</span> GET{' '}
              <span className="text-white/40">{window.location.pathname}</span>
            </p>
            <p className="text-red-400">✖ 404 Not Found — route does not exist</p>
            <p className="text-white/30">
              Hint: Check the URL or navigate back to a known route.
            </p>
            <p>
              <span className="text-[#5ef0ff]">$</span>{' '}
              <span className="animate-pulse">█</span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 font-mono text-xs text-white/70 transition-all hover:bg-white/10 hover:text-white hover:border-white/30"
          >
            ← Go back
          </button>
          <button
            type="button"
            onClick={() => navigate('/runs')}
            className="rounded-lg border border-[#5ef0ff]/30 bg-[#5ef0ff]/10 px-4 py-2 font-mono text-xs text-[#5ef0ff] transition-all hover:bg-[#5ef0ff]/20 hover:border-[#5ef0ff]/50"
          >
            Go to Dashboard →
          </button>
        </div>
      </motion.div>
    </div>
  );
}

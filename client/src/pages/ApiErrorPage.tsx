import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { WebGLShader } from '../components/WebGLShader';

interface ApiErrorPageProps {
  status?: number;
  message?: string;
  onRetry?: () => void;
}

export function ApiErrorPage({ status = 500, message, onRetry }: ApiErrorPageProps) {
  const navigate = useNavigate();

  const errorMeta: Record<number, { title: string; detail: string; color: string }> = {
    401: { title: 'Unauthorized', detail: 'Your session has expired or the API key is invalid.', color: '#f59e0b' },
    403: { title: 'Forbidden', detail: 'You do not have permission to access this resource.', color: '#f59e0b' },
    404: { title: 'Not Found', detail: 'The requested resource could not be found on the server.', color: '#5ef0ff' },
    429: { title: 'Rate Limited', detail: 'Too many requests — the API rate limit has been reached.', color: '#ff4fd8' },
    500: { title: 'Server Error', detail: 'An unexpected error occurred on the server.', color: '#ef4444' },
    503: { title: 'Service Unavailable', detail: 'The backend is temporarily unavailable. Try again in a moment.', color: '#ef4444' },
  };

  const meta = errorMeta[status] ?? errorMeta[500];

  return (
    <div className="spectre-shell relative flex min-h-screen flex-col items-center justify-center text-fg overflow-hidden">
      <WebGLShader className="opacity-70" />

      {/* Ambient glow coloured by error type */}
      <div
        className="pointer-events-none absolute -z-10"
        style={{
          width: 500,
          height: 300,
          borderRadius: '50%',
          background: `radial-gradient(ellipse at center, ${meta.color}18 0%, ${meta.color}08 50%, transparent 80%)`,
          filter: 'blur(60px)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center gap-8 text-center px-6 max-w-lg w-full"
      >
        {/* Status code */}
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.3em] opacity-40" style={{ color: meta.color }}>
            API Error
          </span>
          <motion.div
            className="font-mono text-[6rem] font-black leading-none"
            style={{ color: meta.color }}
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            {status}
          </motion.div>
          <p className="font-mono text-lg font-semibold text-white/80 tracking-wide">{meta.title}</p>
        </div>

        {/* Terminal block */}
        <div className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left font-mono text-xs">
          <div className="flex items-center gap-2 mb-3 border-b border-white/5 pb-2">
            <span className="h-2 w-2 rounded-full bg-red-500/80" />
            <span className="h-2 w-2 rounded-full bg-yellow-500/80" />
            <span className="h-2 w-2 rounded-full bg-green-500/80" />
            <span className="ml-2 text-white/30 text-2xs">agenticx — api trace</span>
          </div>
          <div className="space-y-1.5">
            <p style={{ color: meta.color }}>✖ HTTP {status} — {meta.title}</p>
            <p className="text-white/50">{message || meta.detail}</p>
            <p className="text-white/30">Timestamp: {new Date().toISOString()}</p>
            <p>
              <span style={{ color: meta.color }}>$</span>{' '}
              <span className="animate-pulse text-white/40">█</span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border px-4 py-2 font-mono text-xs transition-all"
              style={{
                borderColor: `${meta.color}50`,
                backgroundColor: `${meta.color}10`,
                color: meta.color,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${meta.color}20`; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${meta.color}10`; }}
            >
              ↺ Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/runs')}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 font-mono text-xs text-white/70 transition-all hover:bg-white/10 hover:text-white"
          >
            Go to Dashboard →
          </button>
          <button
            type="button"
            onClick={() => navigate('/api')}
            className="rounded-lg border border-white/10 bg-transparent px-4 py-2 font-mono text-xs text-white/40 transition-all hover:text-white/70"
          >
            Check API Keys
          </button>
        </div>
      </motion.div>
    </div>
  );
}

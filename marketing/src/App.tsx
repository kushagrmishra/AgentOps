import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ShaderBackground } from '@/components/ui/web-gl-shader';
import { Dock, NavIcons } from '@/components/ui/dock';
import { LandingPage } from './pages/LandingPage';
import { PricingPage } from './pages/PricingPage';
import { LegalPage } from './pages/LegalPage';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { TextScramble } from '@/components/core/text-scramble';
import { RouteProgressBar } from '@/components/ui/route-progress-bar';
import { motion } from 'motion/react';

const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173';

function ScrambleWordmark({ className = 'font-logo text-2xl sm:text-3xl font-extrabold tracking-normal text-white' }: { className?: string }) {
  const [trigger, setTrigger] = useState(false);

  return (
    <TextScramble
      as="span"
      speed={0.01}
      trigger={trigger}
      onHoverStart={() => setTrigger(true)}
      onScrambleComplete={() => setTrigger(false)}
      characterSet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%"
      className={className}
    >
      AgenticX
    </TextScramble>
  );
}

function Nav() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 w-full frosted-navbar transition-all">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 py-2">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--spectre-cyan)]"
        >
          <img src="/logo.png" alt="AgenticX" width={36} height={36} className="h-9 w-9 object-contain" />
          <ScrambleWordmark className="font-logo text-xl font-bold tracking-normal text-white" />
        </Link>

        <Dock
          className="ml-auto border border-white/15 bg-white/[0.05] shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-xl px-2 py-1"
          iconSize={32}
          gap={4}
          magnification={1.25}
          borderRadius={9999}
          items={[
            { label: 'Pricing', icon: NavIcons.pricing, onClick: () => navigate('/pricing') },
            { label: 'FAQ', icon: NavIcons.faq, onClick: () => navigate({ pathname: '/', hash: '#faq' }) },
            { label: 'Sign in', icon: NavIcons.signin, href: `${APP_URL}/sign-in` },
            { label: 'Start free', icon: NavIcons.start, href: `${APP_URL}/sign-up` },
          ]}
        />
      </div>
    </header>
  );
}

function HashScroll() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/' || location.hash !== '#faq') return;
    requestAnimationFrame(() => {
      document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [location.pathname, location.hash]);

  return null;
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative z-20 mt-8 border-t border-white/10 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-sm font-semibold tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <img src="/logo.png" alt="AgenticX" width={48} height={48} className="h-12 w-12 object-contain" />
            <ScrambleWordmark className="font-logo text-xl font-bold tracking-normal text-white" />
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white font-normal">
            Control plane for planning agents, tool-calling sub-agents, and eval runs.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Product</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link to="/pricing" className="footer-link">
                Pricing
              </Link>
            </li>
            <li>
              <Link to={{ pathname: '/', hash: '#faq' }} className="footer-link">
                FAQ
              </Link>
            </li>
            <li>
              <a href={`${APP_URL}/sign-up`} className="footer-link">
                Start free
              </a>
            </li>
            <li>
              <a href={`${APP_URL}/sign-in`} className="footer-link">
                Sign in
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Resources</p>
          <ul className="mt-3 space-y-2">
            <li>
              <a href={`${APP_URL}/sign-up`} className="footer-link">
                App
              </a>
            </li>
            <li>
              <Link to="/pricing" className="footer-link">
                Plans & quotas
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Legal</p>
          <ul className="mt-3 space-y-2">
            <li>
              <Link to="/terms" className="footer-link">
                Terms
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="footer-link">
                Privacy
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl px-6 py-6 text-sm text-white/80">
          © {year} AgenticX
        </div>
      </div>
    </footer>
  );
}

export function App() {
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  return (
    <>
      <RouteProgressBar />
      {loading && <LoadingScreen onComplete={() => setLoading(false)} />}
      <div
        className="spectre-shell relative min-h-screen overflow-x-clip bg-base"
        style={loading ? { visibility: 'hidden' } : undefined}
      >
        <ShaderBackground className="opacity-90" />

        {/* ── VHS overlay ── */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[9998] overflow-hidden">
          {/* scanlines */}
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 4px)',
            }}
          />
          {/* noise grain */}
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: '180px',
              opacity: 0.035,
              mixBlendMode: 'overlay',
            }}
          />
          {/* horizontal tape-glitch bar */}
          <div className="vhs-glitch-bar" />
          {/* chromatic aberration edge */}
          <div
            style={{
              position: 'absolute', inset: 0,
              boxShadow: 'inset 2px 0 0 rgba(255,0,80,0.07), inset -2px 0 0 rgba(0,200,255,0.07)',
              animation: 'vhs-chroma 6s ease-in-out infinite',
            }}
          />
        </div>

        <style>{`
          @keyframes vhs-chroma {
            0%,100% { opacity: 0.5; }
            48%     { opacity: 0.5; }
            50%     { opacity: 1; transform: translateX(1px); }
            52%     { opacity: 0.5; transform: translateX(-1px); }
            54%     { opacity: 0.5; transform: translateX(0); }
          }
          @keyframes vhs-bar {
            0%   { top: -20%; opacity: 0; }
            5%   { opacity: 0.6; }
            20%  { top: 110%; opacity: 0.3; }
            21%  { opacity: 0; }
            100% { top: 110%; opacity: 0; }
          }
          .vhs-glitch-bar {
            position: absolute;
            left: 0; right: 0;
            height: 3px;
            background: linear-gradient(90deg, transparent 10%, rgba(94,240,255,0.25) 50%, transparent 90%);
            animation: vhs-bar 8s linear infinite;
            mix-blend-mode: screen;
          }
        `}</style>

        <HashScroll />
        <Nav />
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0.35, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <Routes>
            <Route path="/" element={<LandingPage appUrl={APP_URL} />} />
            <Route path="/pricing" element={<PricingPage appUrl={APP_URL} />} />
            <Route path="/terms" element={<LegalPage kind="terms" />} />
            <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          </Routes>
        </motion.div>
        <Footer />
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ShaderBackground } from '@/components/ui/web-gl-shader';
import { Dock, NavIcons } from '@/components/ui/dock';
import { LandingPage } from './pages/LandingPage';
import { PricingPage } from './pages/PricingPage';
import { LegalPage } from './pages/LegalPage';
import { LoadingScreen } from '@/components/ui/loading-screen';

const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173';

function Nav() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 overflow-visible px-6 pb-4 pt-3 backdrop-blur-md">
      <Link
        to="/"
        className="flex shrink-0 items-center gap-2 rounded-sm font-semibold tracking-tight text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span
          className="liquid-glass inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-1.5"
          aria-hidden
        >
          <img src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
        </span>
        AgentOps
      </Link>
      <Dock
        className="ml-auto"
        items={[
          { label: 'Pricing', icon: NavIcons.pricing, onClick: () => navigate('/pricing') },
          { label: 'FAQ', icon: NavIcons.faq, onClick: () => navigate({ pathname: '/', hash: '#faq' }) },
          { label: 'Sign in', icon: NavIcons.signin, href: `${APP_URL}/sign-in` },
          { label: 'Start', icon: NavIcons.start, href: `${APP_URL}/sign-up` },
        ]}
        borderRadius={9999}
      />
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
            <span
              className="liquid-glass inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-1"
              aria-hidden
            >
              <img src="/logo.png" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
            </span>
            AgentOps
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Control plane for planning agents, tool-calling sub-agents, and eval runs.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Product</p>
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
          <p className="text-sm font-semibold">Resources</p>
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
          <p className="text-sm font-semibold">Legal</p>
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
        <div className="mx-auto flex max-w-6xl px-6 py-6 text-sm text-faint">
          © {year} AgentOps
        </div>
      </div>
    </footer>
  );
}

export function App() {
  const [loading, setLoading] = useState(true);

  return (
    <>
      {loading && <LoadingScreen onComplete={() => setLoading(false)} />}
      <div
        className="spectre-shell relative min-h-screen overflow-x-clip bg-base"
        style={loading ? { visibility: 'hidden' } : undefined}
      >
        <ShaderBackground className="opacity-50" />
        <HashScroll />
        <Nav />
        <Routes>
          <Route path="/" element={<LandingPage appUrl={APP_URL} />} />
          <Route path="/pricing" element={<PricingPage appUrl={APP_URL} />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        </Routes>
        <Footer />
      </div>
    </>
  );
}

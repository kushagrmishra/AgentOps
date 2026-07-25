import { Link, Route, Routes } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { PricingPage } from './pages/PricingPage';
import { LegalPage } from './pages/LegalPage';

const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173';

function Nav() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
      <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/15 ring-1 ring-accent/40">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        AgentOps
      </Link>
      <nav className="flex items-center gap-4 text-sm text-muted">
        <Link to="/pricing" className="hover:text-fg">Pricing</Link>
        <a href={`${APP_URL}/sign-in`} className="hover:text-fg">Sign in</a>
        <a
          href={`${APP_URL}/sign-up`}
          className="rounded-lg bg-accent px-3.5 py-1.5 font-medium text-white hover:bg-accent/85"
        >
          Get started
        </a>
      </nav>
    </header>
  );
}

export function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Routes>
        <Route path="/" element={<LandingPage appUrl={APP_URL} />} />
        <Route path="/pricing" element={<PricingPage appUrl={APP_URL} />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      </Routes>
      <footer className="mx-auto flex max-w-6xl justify-between border-t border-line px-6 py-6 text-xs text-faint">
        <span>© {new Date().getFullYear()} AgentOps</span>
        <span className="flex gap-4">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </span>
      </footer>
    </div>
  );
}

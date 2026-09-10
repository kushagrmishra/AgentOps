import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  SignedIn,
  SignedOut,
  SignIn,
  SignUp,
  useAuth,
  useClerk,
  OrganizationSwitcher,
  UserButton,
} from '@clerk/clerk-react';
import posthog from 'posthog-js';
import { setTokenGetter, setUnauthorizedHandler, api } from './lib/api';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { DashboardPage } from './pages/DashboardPage';
import { RunDetailPage } from './pages/RunDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { ApiPage } from './pages/ApiPage';
import { BillingPage } from './pages/BillingPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { AuthProvider } from './context/AuthContext';
import { Logo } from './components/Logo';
import { WebGLShader } from './components/WebGLShader';

const EvalsPage = lazy(() =>
  import('./pages/EvalsPage').then((module) => ({ default: module.EvalsPage })),
);

const MARKETING_URL =
  (import.meta.env.VITE_MARKETING_URL as string | undefined) || 'http://127.0.0.1:5174';

function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted">
      <Spinner />
      <span className="font-mono text-xs">{label}</span>
    </div>
  );
}

/** Entry: marketing site first. Signed-in users go to the dashboard. */
function RootEntry() {
  return (
    <>
      <SignedOut>
        <MarketingRedirect />
      </SignedOut>
      <SignedIn>
        <Navigate to="/runs" replace />
      </SignedIn>
    </>
  );
}

function MarketingRedirect() {
  useEffect(() => {
    window.location.replace(MARKETING_URL);
  }, []);
  return (
    <div className="spectre-shell relative flex min-h-screen flex-col text-muted">
      <WebGLShader className="opacity-50" />
      <header className="relative z-20 mx-3 mt-3 flex items-center justify-between gap-3 overflow-visible px-2 pb-3 pt-2">
        <Logo href={MARKETING_URL} />
      </header>
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <Spinner />
        <span className="ml-2 font-mono text-xs">Redirecting to AgentOps…</span>
      </div>
    </div>
  );
}

function ClerkTokenBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  useEffect(() => {
    setTokenGetter(async () => (await getToken()) ?? null);
    setUnauthorizedHandler(() => {
      void signOut().finally(() => {
        window.location.href = '/sign-in';
      });
    });
  }, [getToken, signOut]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    let cancelled = false;
    void (async () => {
      // Wait for a real JWT before hitting /me — otherwise we 401 and bounce new accounts.
      const token = await getToken();
      if (!token || cancelled) return;
      try {
        const me = await api.me();
        if (cancelled) return;
        localStorage.setItem('agentops.activeOrgId', me.active_org_id);
        posthog.identify(userId, { email: me.email, plan: me.plan });
        posthog.capture('signup_or_session', { org_id: me.active_org_id });
        if (!localStorage.getItem('agentops.onboarded')) {
          navigate('/onboarding');
        }
      } catch {
        /* ignore — onboarding/dashboard can retry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, getToken, navigate]);

  return <>{children}</>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
      <SignedIn>{children}</SignedIn>
    </>
  );
}

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="spectre-shell relative flex min-h-screen flex-col text-fg">
      <WebGLShader className="opacity-50" />
      <header className="relative z-20 mx-3 mt-3 flex items-center justify-between gap-3 overflow-visible px-2 pb-3 pt-2">
        <Logo href={MARKETING_URL} />
        <a
          href={MARKETING_URL}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        >
          <span aria-hidden>←</span>
          Marketing
        </a>
      </header>
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-6">
        <div className="relative z-10 flex w-full max-w-md flex-col items-center">
          <div className="glass-panel w-full rounded-2xl border border-white/15 p-4 backdrop-blur-xl">
            {children}
          </div>
          <a href={MARKETING_URL} className="mt-6 text-xs text-muted hover:text-fg">
            ← Back to marketing site
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ClerkTokenBridge>
          <Routes>
            <Route path="/" element={<RootEntry />} />
            <Route
              path="/sign-in/*"
              element={
                <AuthLayout>
                  <SignIn
                    routing="path"
                    path="/sign-in"
                    signUpUrl="/sign-up"
                    forceRedirectUrl="/runs"
                    fallbackRedirectUrl="/runs"
                  />
                </AuthLayout>
              }
            />
            <Route
              path="/sign-up/*"
              element={
                <AuthLayout>
                  <SignUp
                    routing="path"
                    path="/sign-up"
                    signInUrl="/sign-in"
                    forceRedirectUrl="/onboarding"
                    fallbackRedirectUrl="/onboarding"
                  />
                </AuthLayout>
              }
            />
            <Route
              element={
                <RequireAuth>
                  <AppShell
                    marketingUrl={MARKETING_URL}
                    extras={
                      <div className="flex items-center gap-1.5">
                        <OrganizationSwitcher
                          hidePersonal={false}
                          afterSelectOrganizationUrl="/runs"
                          appearance={{ elements: { rootBox: 'text-xs' } }}
                        />
                        <UserButton afterSignOutUrl={MARKETING_URL} />
                      </div>
                    }
                  />
                </RequireAuth>
              }
            >
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/runs" element={<DashboardPage />} />
              <Route path="/runs/:runId" element={<RunDetailPage />} />
              <Route
                path="/evals"
                element={
                  <Suspense fallback={<PageLoading label="loading evals…" />}>
                    <EvalsPage />
                  </Suspense>
                }
              />
              <Route path="/api" element={<ApiPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<RootEntry />} />
          </Routes>
        </ClerkTokenBridge>
      </AuthProvider>
    </BrowserRouter>
  );
}

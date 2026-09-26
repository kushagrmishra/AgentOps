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
import { dark } from '@clerk/themes';
import posthog from 'posthog-js';
import { setTokenGetter, setUnauthorizedHandler, api } from './lib/api';
import { AppShell } from './components/AppShell';
import UniqueLoading from './components/ui/morph-loading';
import { TextScramble } from './components/core/text-scramble';
import { DashboardPage } from './pages/DashboardPage';
import { RunDetailPage } from './pages/RunDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { ApiPage } from './pages/ApiPage';
import { BillingPage } from './pages/BillingPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AuthProvider } from './context/AuthContext';
import { Logo } from './components/Logo';
import { WebGLShader } from './components/WebGLShader';
import { RouteProgressBar } from './components/RouteProgressBar';

const EvalsPage = lazy(() =>
  import('./pages/EvalsPage').then((module) => ({ default: module.EvalsPage })),
);

const MARKETING_URL =
  (import.meta.env.VITE_MARKETING_URL as string | undefined) || 'http://127.0.0.1:5174';

function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-muted">
      <UniqueLoading variant="morph" size="md" />
      <TextScramble as="span" className="font-mono text-xs text-muted" duration={0.8}>
        {label}
      </TextScramble>
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
      <WebGLShader className="opacity-80" />
      <header className="sticky top-0 z-40 w-full frosted-navbar transition-all">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 py-2">
          <Logo href={MARKETING_URL} />
        </div>
      </header>
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4">
        <UniqueLoading variant="morph" size="md" />
        <TextScramble as="span" className="font-mono text-xs text-muted" duration={1}>
          Redirecting to AgenticX…
        </TextScramble>
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
    <div className="spectre-shell relative flex min-h-screen flex-col text-white">
      <WebGLShader className="opacity-80" />
      <header className="sticky top-0 z-40 w-full frosted-navbar transition-all">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 py-2">
          <Logo href={MARKETING_URL} />
          <a
            href={MARKETING_URL}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/10 hover:text-white"
          >
            <span aria-hidden>←</span>
            Marketing
          </a>
        </div>
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

const clerkAuthAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#4d8dff',
    colorBackground: 'transparent',
    colorInputBackground: '#161b24',
    colorInputText: '#ffffff',
    colorText: '#ffffff',
    colorTextSecondary: '#cbd5e1',
    colorTextOnPrimaryBackground: '#ffffff',
  },
  elements: {
    rootBox: 'w-full',
    card: 'bg-transparent shadow-none p-0 w-full',
    cardBox: 'bg-transparent shadow-none w-full',
    headerTitle: 'text-white font-bold text-xl tracking-tight',
    headerSubtitle: 'text-slate-300 text-xs mt-1',
    socialButtonsBlockButton:
      'bg-white/5 border border-white/15 text-white hover:bg-white/10 hover:border-white/30 transition-all font-medium text-xs',
    socialButtonsBlockButtonText: 'text-white font-medium',
    dividerLine: 'bg-white/15',
    dividerText: 'text-slate-400 text-2xs uppercase tracking-wider',
    formFieldLabel: 'text-white text-xs font-medium',
    formFieldLabelRow: 'text-white text-xs',
    formFieldOptional: 'text-slate-400 text-2xs',
    formFieldInput:
      'bg-[#161b24] border border-white/20 text-white placeholder:text-slate-400 focus:border-accent focus:ring-1 focus:ring-accent/40 text-sm',
    formButtonPrimary:
      'bg-accent text-white hover:bg-accent/85 border-transparent text-xs font-semibold py-2.5 transition-all shadow-sm',
    footer: 'bg-transparent border-t border-white/10 mt-4 pt-4',
    footerAction: 'bg-transparent text-slate-300 text-xs',
    footerActionText: 'text-slate-300 text-xs',
    footerActionLink: 'text-accent hover:text-white font-medium ml-1 transition-colors',
    identityPreviewText: 'text-white font-medium',
    identityPreviewEditButtonIcon: 'text-white',
    formFieldHintText: 'text-slate-400 text-xs',
    formFieldSuccessText: 'text-[#7cff9a] text-xs',
    formFieldErrorText: 'text-[#f85149] text-xs',
  },
};

export default function App() {
  return (
    <BrowserRouter>
      <RouteProgressBar />
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
                    appearance={clerkAuthAppearance}
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
                    appearance={clerkAuthAppearance}
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
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ClerkTokenBridge>
      </AuthProvider>
    </BrowserRouter>
  );
}

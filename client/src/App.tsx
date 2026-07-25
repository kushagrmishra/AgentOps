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
import { OnboardingPage } from './pages/OnboardingPage';
import { AuthProvider } from './context/AuthContext';

const EvalsPage = lazy(() =>
  import('./pages/EvalsPage').then((module) => ({ default: module.EvalsPage })),
);

function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted">
      <Spinner />
      <span className="font-mono text-xs">{label}</span>
    </div>
  );
}

function ClerkTokenBridge({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn, userId } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  useEffect(() => {
    setTokenGetter(async () => (await getToken()) ?? null);
    setUnauthorizedHandler(() => {
      void signOut();
      navigate('/sign-in');
    });
  }, [getToken, signOut, navigate]);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    void api.me().then((me) => {
      localStorage.setItem('agentops.activeOrgId', me.active_org_id);
      posthog.identify(userId, { email: me.email, plan: me.plan });
      posthog.capture('signup_or_session', { org_id: me.active_org_id });
      if (!localStorage.getItem('agentops.onboarded')) {
        navigate('/onboarding');
      }
    }).catch(() => undefined);
  }, [isSignedIn, userId, navigate]);

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
    <div className="flex min-h-screen items-center justify-center bg-base p-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <ClerkTokenBridge>
        <Routes>
          <Route
            path="/sign-in/*"
            element={
              <AuthLayout>
                <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
              </AuthLayout>
            }
          />
          <Route
            path="/sign-up/*"
            element={
              <AuthLayout>
                <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
              </AuthLayout>
            }
          />
          <Route
            element={
              <RequireAuth>
                <AppShell
                  extras={
                    <div className="flex items-center gap-3">
                      <OrganizationSwitcher
                        hidePersonal={false}
                        afterSelectOrganizationUrl="/runs"
                        appearance={{ elements: { rootBox: 'text-xs' } }}
                      />
                      <UserButton afterSignOutUrl="/sign-in" />
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
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/runs" replace />} />
        </Routes>
      </ClerkTokenBridge>
      </AuthProvider>
    </BrowserRouter>
  );
}

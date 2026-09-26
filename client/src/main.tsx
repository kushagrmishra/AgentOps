import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import './index.css';
import App from './App.tsx';

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const posthogHost = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';

if (sentryDsn) {
  Sentry.init({ dsn: sentryDsn, tracesSampleRate: 0.1 });
}
if (posthogKey) {
  posthog.init(posthogKey, { api_host: posthogHost, capture_pageview: true });
}

const root = createRoot(document.getElementById('root')!);

function ErrorFallback({
  error,
  resetError,
}: {
  error: unknown;
  resetError: () => void;
}) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base p-6 text-white">
      <div className="glass-panel w-full max-w-md rounded-2xl border border-white/15 p-6 text-center space-y-4 backdrop-blur-xl">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-danger/20 text-danger text-xl font-bold">
          !
        </div>
        <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
        {message && (
          <p className="text-xs text-faint font-mono bg-black/40 p-3 rounded-lg border border-white/10 text-left overflow-auto max-h-32 whitespace-pre-wrap">
            {message}
          </p>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <button
            type="button"
            onClick={() => resetError()}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/85 transition"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10 transition"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}

root.render(
  <StrictMode>
    {clerkKey ? (
      <ClerkProvider
        publishableKey={clerkKey}
        afterSignOutUrl="/sign-in"
        appearance={{
          baseTheme: dark,
          variables: {
            colorPrimary: '#4d8dff',
            colorBackground: '#10141b',
            colorInputBackground: '#161b24',
            colorInputText: '#ffffff',
            colorText: '#ffffff',
            colorTextSecondary: '#94a3b8',
          },
        }}
      >
        <Sentry.ErrorBoundary fallback={ErrorFallback}>
          <App />
        </Sentry.ErrorBoundary>
      </ClerkProvider>
    ) : (
      <div className="flex min-h-screen items-center justify-center bg-base p-8 text-fg">
        <div className="max-w-md space-y-3 text-sm">
          <h1 className="text-lg font-semibold">Clerk key required</h1>
          <p className="text-muted">
            Set <code className="font-mono text-accent">VITE_CLERK_PUBLISHABLE_KEY</code> in{' '}
            <code className="font-mono">client/.env</code> (Stage 1).
          </p>
        </div>
      </div>
    )}
  </StrictMode>,
);

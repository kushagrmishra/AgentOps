import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
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

root.render(
  <StrictMode>
    {clerkKey ? (
      <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/sign-in">
        <Sentry.ErrorBoundary fallback={<p className="p-8 text-danger">Something went wrong.</p>}>
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

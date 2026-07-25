import { Navigate } from 'react-router-dom';

/** Legacy password auth page — replaced by Clerk. */
export function AuthPage({ mode: _mode }: { mode: 'login' | 'register' }) {
  return <Navigate to="/sign-in" replace />;
}

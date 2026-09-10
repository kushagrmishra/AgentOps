import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import { api, type MeResponse } from '../lib/api';

interface AuthState {
  user: MeResponse | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [user, setUser] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !clerkUser) {
      setUser(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      try {
        const me = await api.me();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, clerkUser, getToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading: !isLoaded,
        logout: () => {
          void signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components -- hook colocated with AuthProvider
export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}

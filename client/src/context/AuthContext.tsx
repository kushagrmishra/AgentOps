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
  // Kept for compatibility; ClerkProvider is the real auth boundary.
  const { isLoaded, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [user, setUser] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (!clerkUser) {
      setUser(null);
      return;
    }
    void api.me().then(setUser).catch(() => setUser(null));
  }, [clerkUser]);

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

export function useAuthContext(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider missing');
  return ctx;
}

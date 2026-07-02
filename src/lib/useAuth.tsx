import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isAnonymousUser } from "./anon-auth";

// Run the device→user link at most once per page load per user id, regardless
// of how many components mount `useAuth`.
const linkedUsers = new Set<string>();

async function linkDeviceIfPossible(session: Session | null) {
  if (typeof window === "undefined") return;
  const uid = session?.user?.id;
  if (!uid || linkedUsers.has(uid)) return;
  linkedUsers.add(uid);
  try {
    const [{ linkDeviceToUser }, { getDeviceId, getDeviceToken }] = await Promise.all([
      import("./suggestions.functions"),
      import("./pwa"),
    ]);
    const token = await getDeviceToken();
    if (!token) return;
    await linkDeviceToUser({
      data: {
        deviceId: getDeviceId(),
        deviceToken: token,
        accessToken: session.access_token,
      },
    });
  } catch {
    // Best-effort backfill; silently ignore failures.
    linkedUsers.delete(uid);
  }
}

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isAnonymous: boolean;
  isPermanent: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
      void linkDeviceIfPossible(data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        void linkDeviceIfPossible(s);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;
  const isAnonymous = isAnonymousUser(user as User | null);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user,
      loading,
      isAnonymous,
      isPermanent: !!user && !isAnonymous,
    }),
    [session, user, loading, isAnonymous],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

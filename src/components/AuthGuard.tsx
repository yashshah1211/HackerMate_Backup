"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

            if (!user) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.href = `/?next=${encodeURIComponent(next)}`;
        return;
      }

      // Check if user has completed onboarding
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, onboarding_completed")
        .eq("id", user.id)
        .single();

      if (!profile || error || !profile.onboarding_completed) {
        // Profile missing or onboarding not finished — send to onboarding
        window.location.href = "/onboarding";
        return;
      }

      setAuthorized(true);
    }

    checkAuth();
  }, []);

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}

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

      // Check if user has completed onboarding (has a profile)
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      console.log("AuthGuard - Profile check:", { userId: user.id, profile, error });

      if (!profile || error) {
        // User hasn't completed onboarding, redirect to onboarding page
        console.log("AuthGuard - Redirecting to onboarding");
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

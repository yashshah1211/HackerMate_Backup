"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";

function EditProfileRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings?tab=profile");
  }, [router]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
      <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs text-zinc-400 font-medium">Redirecting to Settings...</p>
    </div>
  );
}

export default function EditProfilePage() {
  return (
    <AuthGuard>
      <EditProfileRedirect />
    </AuthGuard>
  );
}

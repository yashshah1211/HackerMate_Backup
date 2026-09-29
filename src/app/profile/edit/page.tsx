"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { Page, PageLoader } from "@/components/system";

function EditProfileRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings?tab=profile");
  }, [router]);

  return (
    <Page width="narrow">
      <PageLoader label="Opening settings" />
    </Page>
  );
}

export default function EditProfilePage() {
  return (
    <AuthGuard>
      <EditProfileRedirect />
    </AuthGuard>
  );
}

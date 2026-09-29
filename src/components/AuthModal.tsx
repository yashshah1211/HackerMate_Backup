"use client";

import { Dialog } from "@/components/system";
import { SignInPanel } from "@/components/auth/SignInPanel";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  nextUrl?: string;
};

/**
 * In-context sign-in (e.g. submitting a challenge while signed out). Same
 * props and OAuth flow as V1; rendered in the V2 Dialog (bottom sheet on mobile).
 */
export default function AuthModal({
  isOpen,
  onClose,
  title = "Sign in to HackerMate",
  subtitle = "Use Google or GitHub to join teams and hackathons.",
  nextUrl,
}: AuthModalProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} size="md" title="Sign in to continue">
      <SignInPanel title={title} subtitle={subtitle} nextUrl={nextUrl} titleAs="h2" className="[&_h2]:text-[26px] [&_h2]:md:text-[28px]" />
    </Dialog>
  );
}

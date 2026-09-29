"use client";

import { useId, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { GithubIcon } from "@/components/system";
import { cn } from "@/lib/utils";

type Provider = "google" | "github";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

/**
 * V2 sign-in panel. Same behaviour as the V1 ModernOAuthSignIn: Google or
 * GitHub OAuth through Supabase, gated on the 18+ / Terms / Privacy consent,
 * returning through /auth/callback?next=… so the callback's onboarding
 * redirect still applies.
 */
export function SignInPanel({
  title = "Sign in to HackerMate",
  subtitle = "Use Google or GitHub. New here? The same button creates your account.",
  nextUrl,
  className,
  titleAs: TitleTag = "h1",
}: {
  title?: string;
  subtitle?: string;
  nextUrl?: string;
  className?: string;
  titleAs?: "h1" | "h2";
}) {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consentId = useId();
  const hintId = useId();

  const handleOAuthSignIn = async (provider: Provider) => {
    if (!consentChecked) return;
    setError(null);
    setLoadingProvider(provider);
    const targetUrl = nextUrl || (typeof window !== "undefined" ? window.location.href : "/dashboard");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "");
    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(targetUrl)}`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    // On success the browser navigates away; an error means we stay here.
    if (oauthError) {
      console.error(`[auth] ${provider} sign-in failed:`, oauthError);
      setError(oauthError.message || "Couldn't start sign-in. Try again.");
      setLoadingProvider(null);
    }
  };

  const disabled = !consentChecked || Boolean(loadingProvider);
  const providerBtn = cn(
    "relative flex h-12 w-full items-center justify-center gap-3 rounded-md border border-line-strong bg-raised px-4 text-[14.5px] font-medium text-ink",
    "transition-[background-color,border-color,opacity,transform] duration-150 hover:border-ink-4 hover:bg-overlay active:scale-[0.99]",
    "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line-strong disabled:hover:bg-raised disabled:active:scale-100",
  );

  return (
    <div className={cn("w-full", className)}>
      <TitleTag
        data-v2-heading
        className="font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink [font-variation-settings:'wdth'_88] md:text-[36px]"
      >
        {title}
      </TitleTag>
      <p className="mt-2.5 max-w-[42ch] text-[15px] leading-relaxed text-ink-2">{subtitle}</p>

      <div className="mt-7 space-y-2.5">
        <button type="button" onClick={() => handleOAuthSignIn("google")} disabled={disabled} aria-describedby={!consentChecked ? hintId : undefined} className={providerBtn}>
          {loadingProvider === "google" ? <LoaderCircle className="size-5 animate-spin text-ink-3" aria-hidden /> : <GoogleIcon className="size-5 shrink-0" />}
          {loadingProvider === "google" ? "Connecting to Google…" : "Continue with Google"}
        </button>
        <button type="button" onClick={() => handleOAuthSignIn("github")} disabled={disabled} aria-describedby={!consentChecked ? hintId : undefined} className={providerBtn}>
          {loadingProvider === "github" ? <LoaderCircle className="size-5 animate-spin text-ink-3" aria-hidden /> : <GithubIcon className="size-5 shrink-0" />}
          {loadingProvider === "github" ? "Connecting to GitHub…" : "Continue with GitHub"}
        </button>
      </div>

      {/* 18+ / Terms / Privacy consent (required before either provider) */}
      <label
        htmlFor={consentId}
        className={cn(
          "mt-4 flex cursor-pointer select-none items-start gap-3 rounded-md p-3 ring-1 ring-inset transition-colors",
          consentChecked ? "bg-accent-soft ring-accent/35" : "bg-sunken ring-line-strong hover:ring-ink-4",
        )}
      >
        <span className="relative mt-px inline-flex size-[18px] shrink-0">
          <input
            id={consentId}
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[4px] bg-canvas ring-1 ring-inset ring-line-strong checked:bg-accent checked:ring-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hm-focus)]"
          />
          <Check className="pointer-events-none relative m-auto size-3.5 text-on-accent opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden />
        </span>
        <span className="text-[13px] leading-relaxed text-ink-2">
          I confirm I&apos;m 18 or older and agree to the{" "}
          <a href="/terms" target="_blank" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            Privacy Policy
          </a>
          .
        </span>
      </label>
      <p id={hintId} className={cn("mt-2 text-[12.5px] text-ink-3", consentChecked && "invisible")} aria-live="polite">
        Tick the box above to continue.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-bad-soft px-3 py-2.5 text-[13px] text-ink ring-1 ring-inset ring-bad/25">
          {error}
        </p>
      )}
    </div>
  );
}

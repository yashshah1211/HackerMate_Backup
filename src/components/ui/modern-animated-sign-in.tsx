"use client";

import {
  memo,
  ReactNode,
  useState,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  motion,
  useAnimation,
  useInView,
  useReducedMotion,
} from "motion/react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";
import Link from "next/link";
import { ArrowUpRight, Check, LoaderCircle, ShieldCheck } from "lucide-react";

const subscribeToClient = () => () => {};

// ==================== BoxReveal Component ====================

type BoxRevealProps = {
  children: ReactNode;
  width?: string;
  boxColor?: string;
  duration?: number;
  overflow?: string;
  position?: string;
  className?: string;
};

export const BoxReveal = memo(function BoxReveal({
  children,
  width = "fit-content",
  boxColor,
  duration,
  overflow = "hidden",
  position = "relative",
  className,
}: BoxRevealProps) {
  const mainControls = useAnimation();
  const slideControls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const prefersReducedMotion = useReducedMotion();
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const reduceMotion = mounted && prefersReducedMotion;

  useEffect(() => {
    if (isInView || reduceMotion) {
      slideControls.start("visible");
      mainControls.start("visible");
    } else {
      slideControls.start("hidden");
      mainControls.start("hidden");
    }
  }, [isInView, mainControls, slideControls, reduceMotion]);

  return (
    <section
      ref={ref}
      style={{
        position: position as
          | "relative"
          | "absolute"
          | "fixed"
          | "sticky"
          | "static",
        width,
        overflow,
      }}
      className={className}
    >
      <motion.div
        variants={{
          hidden: { opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 24 },
          visible: { opacity: 1, y: 0 },
        }}
        initial="hidden"
        animate={mainControls}
        transition={{ duration: reduceMotion ? 0 : duration ?? 0.45, delay: reduceMotion ? 0 : 0.12 }}
      >
        {children}
      </motion.div>
      {!reduceMotion && <motion.div
        variants={{ hidden: { left: 0 }, visible: { left: "100%" } }}
        initial="hidden"
        animate={slideControls}
        transition={{ duration: duration ?? 0.5, ease: "easeIn" }}
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: 0,
          right: 0,
          zIndex: 20,
          background: boxColor ?? "#B4F461",
          borderRadius: 4,
        }}
      />}
    </section>
  );
});

// ==================== Ripple Component ====================

type RippleProps = {
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
  className?: string;
};

export const Ripple = memo(function Ripple({
  mainCircleSize = 160,
  mainCircleOpacity = 0.2,
  numCircles = 7,
  className = "",
}: RippleProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none",
        "[mask-image:radial-gradient(circle_at_center,black_45%,transparent_80%)]",
        className
      )}
    >
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 50;
        const opacity = Math.max(0.04, mainCircleOpacity - i * 0.025);
        const animationDelay = `${i * 0.08}s`;
        const borderStyle = i === numCircles - 1 ? "dashed" : "solid";

        return (
          <span
            key={i}
            className="absolute animate-ripple rounded-full border border-zinc-700/40"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              opacity: opacity,
              animationDelay: animationDelay,
              borderStyle: borderStyle,
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        );
      })}
    </div>
  );
});

// ==================== OrbitingCircles Component ====================

type OrbitingCirclesProps = {
  className?: string;
  children: ReactNode;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
};

export const OrbitingCircles = memo(function OrbitingCircles({
  className,
  children,
  reverse = false,
  duration = 20,
  delay = 10,
  radius = 50,
  path = true,
}: OrbitingCirclesProps) {
  const prefersReducedMotion = useReducedMotion();
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const reduceMotion = mounted && prefersReducedMotion;
  const startAngle = (delay / duration) * 360;
  return (
    <>
      {path && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          version="1.1"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <circle
            className="stroke-zinc-800/70 stroke-[1px]"
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
          />
        </svg>
      )}
      <motion.div
        initial={{ rotate: startAngle }}
        animate={reduceMotion ? undefined : { rotate: startAngle + (reverse ? -360 : 360) }}
        transition={reduceMotion ? undefined : { duration, repeat: Infinity, ease: "linear" }}
        className="pointer-events-none absolute inset-0 flex transform-gpu items-center justify-center"
      >
        <div style={{ transform: `translateX(${radius}px)` }} className={cn("pointer-events-auto flex items-center justify-center rounded-xl border border-white/[0.09] bg-[#17171b]/95 p-2 shadow-[0_8px_25px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-md transition-transform duration-200 hover:scale-110 motion-reduce:transform-none", className)}>
          {children}
        </div>
      </motion.div>
    </>
  );
});

// ==================== TechOrbitDisplay Component ====================

export type OrbitIconConfig = {
  className?: string;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
  reverse?: boolean;
  component: () => React.ReactNode;
};

// ==================== 100% Official Authentic Tech Icons ====================

const JavaScriptIcon = () => (
  <svg className="size-6 drop-shadow-md rounded shrink-0 overflow-hidden" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="3" fill="#F7DF1E" />
    <path
      d="M12.44 17.5c0 2.22-1.31 3.38-3.32 3.38-1.78 0-2.88-1.02-3.34-2.22l1.69-1.03c.25.68.83 1.25 1.67 1.25.9 0 1.34-.45 1.34-1.39V9.5h1.96v8zM15.58 20.88c-1.34 0-2.38-.56-2.88-1.66l1.66-1.01c.3.6.72.95 1.3.95.7 0 1.16-.36 1.16-.86 0-.6-.45-.85-1.51-1.3-1.46-.6-2.42-1.26-2.42-2.76 0-1.55 1.17-2.62 2.87-2.62 1.22 0 2.07.45 2.62 1.46l-1.57 1.02c-.25-.46-.6-.71-1.05-.71-.5 0-.86.3-.86.7 0 .5.35.75 1.3 1.15 1.66.66 2.63 1.36 2.63 2.91 0 1.74-1.31 2.73-2.85 2.73z"
      fill="#000000"
    />
  </svg>
);

const TypeScriptIcon = () => (
  <svg className="size-6 drop-shadow-md rounded shrink-0 overflow-hidden" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="3" fill="#3178C6" />
    <path
      d="M12.4 8.5H5.8V6.8h8.2v1.7h-1.8v8.7h-2.3V8.5zm4.8 8.7c-1.4 0-2.55-.65-3.15-1.8l1.8-1.05c.35.65.8 1.05 1.45 1.05.7 0 1.15-.35 1.15-.85 0-.55-.4-.8-1.55-1.25-1.55-.6-2.55-1.3-2.55-2.85 0-1.55 1.2-2.7 2.95-2.7 1.3 0 2.2.5 2.8 1.55l-1.7 1.05c-.3-.5-.65-.8-1.1-.8-.5 0-.85.3-.85.7 0 .45.35.7 1.35 1.1 1.75.65 2.75 1.4 2.75 3 0 1.75-1.35 2.85-3.05 2.85z"
      fill="#FFFFFF"
    />
  </svg>
);

const NextJsIcon = () => (
  <svg className="size-6 drop-shadow-md shrink-0" viewBox="0 0 180 180" fill="none">
    <mask height="180" id="mask0_next" maskUnits="userSpaceOnUse" width="180" x="0" y="0" style={{ maskType: "alpha" }}>
      <circle cx="90" cy="90" fill="black" r="90" />
    </mask>
    <g mask="url(#mask0_next)">
      <circle cx="90" cy="90" fill="black" r="90" stroke="#27272a" strokeWidth="4" />
      <path d="M149.508 157.52L69.142 54H54V125.97H66.1136V69.3836L139.999 164.845C143.333 162.614 146.509 160.16 149.508 157.52Z" fill="url(#paint0_linear_next)" />
      <rect fill="url(#paint1_linear_next)" height="72" width="12" x="115" y="54" />
    </g>
    <defs>
      <linearGradient gradientUnits="userSpaceOnUse" id="paint0_linear_next" x1="109" x2="144.5" y1="116.5" y2="160.5">
        <stop stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
      <linearGradient gradientUnits="userSpaceOnUse" id="paint1_linear_next" x1="121" x2="120.799" y1="54" y2="106.875">
        <stop stopColor="white" />
        <stop offset="1" stopColor="white" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
);

const SupabaseIcon = () => (
  <svg className="size-6 drop-shadow-md shrink-0" viewBox="0 0 24 24" fill="none">
    <path
      d="M21.362 9.354H12V.304a.3.3 0 0 0-.52-.204L.203 12.87a.3.3 0 0 0 .222.497H12v9.05a.3.3 0 0 0 .52.205L23.797 9.85a.3.3 0 0 0-.222-.496z"
      fill="#3ECF8E"
    />
  </svg>
);

export const fourTechIcons: OrbitIconConfig[] = [
  // Circle 1: JavaScript (radius 80)
  {
    component: () => <JavaScriptIcon />,
    className: "size-6 border-none bg-transparent",
    duration: 18,
    delay: 0,
    radius: 80,
    path: true,
    reverse: false,
  },
  // Circle 2: TypeScript (radius 120)
  {
    component: () => <TypeScriptIcon />,
    className: "size-7 border-none bg-transparent",
    duration: 24,
    delay: 6,
    radius: 120,
    path: true,
    reverse: true,
  },
  // Circle 3: Next.js (radius 160)
  {
    component: () => <NextJsIcon />,
    className: "size-7 border-none bg-transparent",
    duration: 30,
    delay: 12,
    radius: 160,
    path: true,
    reverse: false,
  },
  // Circle 4: Supabase (radius 200 - comfortably inside card bounds, avoiding edge overlap)
  {
    component: () => <SupabaseIcon />,
    className: "size-7 border-none bg-transparent",
    duration: 36,
    delay: 18,
    radius: 200,
    path: true,
    reverse: true,
  },
];

export const defaultTechIcons = fourTechIcons;

type TechnologyOrbitDisplayProps = {
  iconsArray?: OrbitIconConfig[];
  text?: string;
  subtext?: string;
};

export const TechOrbitDisplay = memo(function TechOrbitDisplay({
  iconsArray = fourTechIcons,
  text = "HackerMate",
  subtext = "FIND YOUR CO-BUILDERS",
}: TechnologyOrbitDisplayProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      {/* Central Brand Shield with Guaranteed Clearance from Inner Orbit */}
      <div className="z-10 text-center pointer-events-none px-4 py-2.5 select-none flex flex-col items-center justify-center rounded-2xl bg-zinc-950/80 border border-zinc-800/50 shadow-2xl backdrop-blur-md max-w-[190px]">
        <span className="block whitespace-nowrap bg-gradient-to-r from-white via-zinc-100 to-[#B4F461] bg-clip-text text-center text-2xl sm:text-[26px] font-extrabold tracking-tight text-transparent drop-shadow-sm leading-none">
          {text}
        </span>
        {subtext && (
          <p className="text-[9px] font-mono text-zinc-400 mt-1.5 tracking-wider uppercase font-semibold whitespace-nowrap">
            {subtext}
          </p>
        )}
      </div>

      {iconsArray.map((icon, index) => (
        <OrbitingCircles
          key={index}
          className={icon.className}
          duration={icon.duration}
          delay={icon.delay}
          radius={icon.radius}
          path={icon.path}
          reverse={icon.reverse}
        >
          {icon.component()}
        </OrbitingCircles>
      ))}
    </div>
  );
});

// ==================== BottomGradient Component (Neutral Specular Edge) ====================

export const BottomGradient = () => {
  return (
    <>
      <span className="group-hover/btn:opacity-100 block transition duration-300 opacity-0 absolute h-px w-full -bottom-px inset-x-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <span className="group-hover/btn:opacity-100 blur-sm block transition duration-300 opacity-0 absolute h-px w-1/2 mx-auto -bottom-px inset-x-10 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </>
  );
};

// ==================== Modern OAuth Sign-In Experience ====================

export interface ModernOAuthSignInProps {
  title?: string;
  subtitle?: string;
  nextUrl?: string;
  className?: string;
}

export function ModernOAuthSignIn({
  title = "Welcome to HackerMate",
  subtitle = "Find your people, join a hackathon, and start building.",
  nextUrl,
  className,
}: ModernOAuthSignInProps) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "github" | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const safeNextUrl = nextUrl?.startsWith("/") && !nextUrl.startsWith("//") && !/[\\\u0000-\u001f]/.test(nextUrl)
    ? nextUrl
    : "/dashboard";

  const handleOAuthSignIn = async (provider: "google" | "github") => {
    if (!consentChecked || loadingProvider) return;
    setLoadingProvider(provider);
    setErrorMessage(null);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNextUrl)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (error) {
      console.error(`Unable to start ${provider} sign-in:`, error);
      setErrorMessage("We couldn't connect to the provider. Please try again.");
      setLoadingProvider(null);
    }
  };

  const buttonClass = "group/btn relative flex min-h-13 w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-white/[0.09] bg-[#1a1a20] px-4 text-sm font-semibold text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_20px_rgba(0,0,0,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#B4F461]/35 hover:bg-[#222229] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.11),0_10px_28px_rgba(180,244,97,0.075)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:border-white/[0.09] disabled:hover:bg-[#1a1a20] disabled:hover:shadow-none motion-reduce:transform-none";

  return (
    <div className={cn("relative isolate grid min-h-[590px] w-full overflow-hidden rounded-[24px] border border-white/[0.085] bg-[#111115]/95 shadow-[0_28px_90px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr]", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-20 top-0 z-20 h-px bg-gradient-to-r from-transparent via-[#B4F461]/35 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-0 -z-10 size-80 rounded-full bg-[#B4F461]/[0.035] blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-0 -z-10 size-80 rounded-full bg-[#22D3EE]/[0.035] blur-[110px]" />

      <div className="relative hidden min-h-[590px] flex-col justify-between overflow-hidden border-r border-white/[0.07] bg-[#0c0c0f] p-10 lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.022)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:38px_38px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[46%] size-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#B4F461]/[0.07] blur-[82px]" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border border-[#B4F461]/20 bg-[#B4F461]/[0.06] text-[#B4F461]">
            <span className="font-mono text-sm font-bold">H</span>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">The builder network</span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex h-[440px] -translate-y-[54%] items-center justify-center select-none">
          <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-[24px] border border-[#B4F461]/20 bg-[#14181a]/90 p-4 shadow-[0_0_0_8px_rgba(180,244,97,0.025),0_24px_70px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.09)] backdrop-blur-xl">
            <Logo className="w-[68px]" />
          </div>
          {fourTechIcons.map((icon, index) => (
            <OrbitingCircles
              key={index}
              className="size-10"
              duration={icon.duration}
              delay={icon.delay}
              radius={icon.radius}
              path={icon.path}
              reverse={icon.reverse}
            >
              {icon.component()}
            </OrbitingCircles>
          ))}
        </div>


      </div>

      <div className="relative z-10 flex w-full flex-col justify-center px-6 py-10 sm:px-12 sm:py-12 lg:px-11">
        <div className="mx-auto w-full max-w-[390px]">
          <div className="mb-9 lg:hidden">
            <div className="inline-flex h-9 items-center rounded-lg border border-[#B4F461]/20 bg-[#B4F461]/[0.06] px-3 font-mono text-[11px] font-semibold tracking-[0.15em] text-[#B4F461]">HACKERMATE</div>
          </div>

          <div className="mb-8">
            <BoxReveal boxColor="#B4F461" duration={0.35}>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.21em] text-[#B4F461]">Your next chapter starts here</p>
            </BoxReveal>
            <BoxReveal boxColor="#B4F461" duration={0.4} width="100%">
              <h1 className="max-w-[330px] bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-[31px] font-semibold leading-[1.13] tracking-[-0.045em] text-transparent sm:text-[35px]">{title}</h1>
            </BoxReveal>
            <BoxReveal boxColor="#22D3EE" duration={0.4} width="100%">
              <p className="mt-4 max-w-[350px] text-sm leading-[1.7] text-zinc-400">{subtitle}</p>
            </BoxReveal>
          </div>

          <BoxReveal boxColor="#27272a" duration={0.35} width="100%">
            <div className="mb-5 rounded-xl border border-white/[0.075] bg-white/[0.025] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              <div className="flex items-start gap-3">
                <input
                  id="login-consent"
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(event) => { setConsentChecked(event.target.checked); setErrorMessage(null); }}
                  className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-zinc-600 bg-zinc-950 accent-[#B4F461] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4F461]"
                />
                <div className="min-w-0 text-xs leading-[1.65] text-zinc-400">
                  <label htmlFor="login-consent" className="cursor-pointer">I confirm I&apos;m 18 or older and agree to the </label>
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-[#B4F461]">Terms</Link>
                  <span> and </span>
                  <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-200 underline decoration-zinc-600 underline-offset-2 transition-colors hover:text-[#B4F461]">Privacy Policy</Link>
                  <span>.</span>
                </div>
              </div>
            </div>
          </BoxReveal>

          <div className="space-y-3">
            <BoxReveal boxColor="#27272a" duration={0.35} width="100%" overflow="visible">
              <button type="button" onClick={() => void handleOAuthSignIn("google")} disabled={!consentChecked || !!loadingProvider} aria-busy={loadingProvider === "google"} className={buttonClass}>
                {loadingProvider === "google" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : (
                  <svg aria-hidden="true" className="size-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>{loadingProvider === "google" ? "Connecting to Google…" : "Continue with Google"}</span>
                {!loadingProvider && <ArrowUpRight aria-hidden="true" className="absolute right-4 size-4 text-zinc-600 transition-colors group-hover/btn:text-[#B4F461]" />}
                <BottomGradient />
              </button>
            </BoxReveal>
            <BoxReveal boxColor="#27272a" duration={0.35} width="100%" overflow="visible">
              <button type="button" onClick={() => void handleOAuthSignIn("github")} disabled={!consentChecked || !!loadingProvider} aria-busy={loadingProvider === "github"} className={buttonClass}>
                {loadingProvider === "github" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : (
                  <svg aria-hidden="true" className="size-5 shrink-0 fill-current text-zinc-100" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                )}
                <span>{loadingProvider === "github" ? "Connecting to GitHub…" : "Continue with GitHub"}</span>
                {!loadingProvider && <ArrowUpRight aria-hidden="true" className="absolute right-4 size-4 text-zinc-600 transition-colors group-hover/btn:text-[#B4F461]" />}
                <BottomGradient />
              </button>
            </BoxReveal>
          </div>

          <div className="mt-5 min-h-5 text-center text-[11px] text-zinc-500" aria-live="polite">
            {errorMessage ? <p role="alert" className="text-rose-400">{errorMessage}</p> : !consentChecked ? "Confirm the terms above to continue." : (
              <span className="inline-flex items-center gap-1.5 text-zinc-400"><Check aria-hidden="true" className="size-3.5 text-[#B4F461]" /> Ready when you are.</span>
            )}
          </div>
          <div className="mt-7 flex items-center justify-center gap-2 border-t border-white/[0.07] pt-6 text-[11px] text-zinc-500">
            <ShieldCheck aria-hidden="true" className="size-3.5 text-zinc-400" />
            Secure OAuth sign-in. No password required.
          </div>
        </div>
      </div>
    </div>
  );
}

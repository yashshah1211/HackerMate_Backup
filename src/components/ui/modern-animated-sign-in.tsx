"use client";

import {
  memo,
  ReactNode,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  motion,
  useAnimation,
  useInView,
} from "motion/react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

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

  useEffect(() => {
    if (isInView) {
      slideControls.start("visible");
      mainControls.start("visible");
    } else {
      slideControls.start("hidden");
      mainControls.start("hidden");
    }
  }, [isInView, mainControls, slideControls]);

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
          hidden: { opacity: 0, y: 75 },
          visible: { opacity: 1, y: 0 },
        }}
        initial="hidden"
        animate={mainControls}
        transition={{ duration: duration ?? 0.5, delay: 0.25 }}
      >
        {children}
      </motion.div>
      <motion.div
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
      />
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
      <div
        style={
          {
            "--duration": duration,
            "--radius": radius,
            "--delay": -delay,
          } as React.CSSProperties
        }
        className={cn(
          "absolute flex size-full transform-gpu animate-orbit items-center justify-center rounded-full border-none bg-transparent [animation-delay:calc(var(--delay)*1000ms)] pointer-events-none",
          { "[animation-direction:reverse]": reverse },
          className
        )}
      >
        <div className="pointer-events-auto transition-transform hover:scale-125 duration-200">
          {children}
        </div>
      </div>
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

export const defaultTechIcons: OrbitIconConfig[] = [
  // Inner orbit: HTML, CSS
  {
    component: () => (
      <img
        width={22}
        height={22}
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/html5/html5-original.svg"
        alt="HTML5"
        className="size-5 drop-shadow-md"
      />
    ),
    className: "size-6 border-none bg-transparent",
    duration: 18,
    delay: 12,
    radius: 90,
    path: true,
    reverse: false,
  },
  {
    component: () => (
      <img
        width={22}
        height={22}
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/css3/css3-original.svg"
        alt="CSS3"
        className="size-5 drop-shadow-md"
      />
    ),
    className: "size-6 border-none bg-transparent",
    duration: 18,
    delay: 4,
    radius: 90,
    path: true,
    reverse: false,
  },
  // Middle orbit: Tailwind, Next.js, TypeScript, JS
  {
    component: () => (
      <img
        width={26}
        height={26}
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/tailwindcss/tailwindcss-original.svg"
        alt="TailwindCSS"
        className="size-6 drop-shadow-md"
      />
    ),
    className: "size-7 border-none bg-transparent",
    duration: 24,
    delay: 16,
    radius: 140,
    path: true,
    reverse: true,
  },
  {
    component: () => (
      <img
        width={26}
        height={26}
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg"
        alt="Next.js"
        className="size-6 drop-shadow-md invert"
      />
    ),
    className: "size-7 border-none bg-transparent",
    duration: 24,
    delay: 6,
    radius: 140,
    path: true,
    reverse: true,
  },
  {
    component: () => (
      <img
        width={30}
        height={30}
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg"
        alt="TypeScript"
        className="size-7 drop-shadow-md"
      />
    ),
    className: "size-8 border-none bg-transparent",
    radius: 140,
    duration: 24,
    delay: 12,
    path: true,
    reverse: true,
  },
  {
    component: () => (
      <img
        width={30}
        height={30}
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg"
        alt="JavaScript"
        className="size-7 drop-shadow-md"
      />
    ),
    className: "size-8 border-none bg-transparent",
    radius: 140,
    duration: 24,
    delay: 20,
    path: true,
    reverse: true,
  },
  // Outer orbit: React, Python, GitHub
  {
    component: () => (
      <img
        width={34}
        height={34}
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg"
        alt="React"
        className="size-8 drop-shadow-md"
      />
    ),
    className: "size-9 border-none bg-transparent",
    radius: 195,
    duration: 32,
    path: true,
    reverse: false,
  },
  {
    component: () => (
      <img
        width={32}
        height={32}
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg"
        alt="Python"
        className="size-7 drop-shadow-md"
      />
    ),
    className: "size-8 border-none bg-transparent",
    radius: 195,
    duration: 32,
    delay: 16,
    path: true,
    reverse: false,
  },
  {
    component: () => (
      <img
        width={32}
        height={32}
        src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/github/github-original.svg"
        alt="GitHub"
        className="size-7 drop-shadow-md invert"
      />
    ),
    className: "size-8 border-none bg-transparent",
    radius: 195,
    duration: 32,
    delay: 8,
    path: true,
    reverse: false,
  },
];

type TechnologyOrbitDisplayProps = {
  iconsArray?: OrbitIconConfig[];
  text?: string;
  subtext?: string;
};

export const TechOrbitDisplay = memo(function TechOrbitDisplay({
  iconsArray = defaultTechIcons,
  text = "HackerMate",
  subtext = "FIND YOUR CO-BUILDERS",
}: TechnologyOrbitDisplayProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      <div className="z-10 text-center pointer-events-none px-4 select-none flex flex-col items-center">
        <span className="block whitespace-pre-wrap bg-gradient-to-r from-white via-zinc-100 to-[#B4F461] bg-clip-text text-center text-3xl sm:text-4xl font-extrabold tracking-tight text-transparent drop-shadow-sm">
          {text}
        </span>
        {subtext && (
          <p className="text-[10px] font-mono text-zinc-400 mt-2 tracking-widest uppercase font-semibold">
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

// ==================== BottomGradient Component ====================

export const BottomGradient = () => {
  return (
    <>
      <span className="group-hover/btn:opacity-100 block transition duration-500 opacity-0 absolute h-px w-full -bottom-px inset-x-0 bg-gradient-to-r from-transparent via-[#B4F461] to-transparent" />
      <span className="group-hover/btn:opacity-100 blur-sm block transition duration-500 opacity-0 absolute h-px w-1/2 mx-auto -bottom-px inset-x-10 bg-gradient-to-r from-transparent via-[#22D3EE] to-transparent" />
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
  subtitle = "Sign in with Google or GitHub in 1 tap to find teammates, join live hackathons, and access your workspace.",
  nextUrl,
  className,
}: ModernOAuthSignInProps) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "github" | null>(null);
  const [consentChecked, setConsentChecked] = useState(true);

  const handleOAuthSignIn = async (provider: "google" | "github") => {
    if (!consentChecked) return;
    setLoadingProvider(provider);
    const targetUrl =
      nextUrl || (typeof window !== "undefined" ? window.location.href : "/dashboard");
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(targetUrl)}`;

    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
      },
    });
  };

  return (
    <div
      className={cn(
        "relative flex w-full min-h-[520px] overflow-hidden rounded-2xl border border-zinc-800/90 bg-zinc-950 shadow-2xl backdrop-blur-xl",
        className
      )}
    >
      {/* Ambient Radial Highlights */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-[#B4F461]/10 blur-[100px]" />
      <div className="pointer-events-none absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-[#22D3EE]/10 blur-[100px]" />

      {/* Left Side: Orbiting Tech Display */}
      <div className="relative hidden w-1/2 flex-col items-center justify-center border-r border-zinc-800/80 bg-zinc-950/70 p-6 lg:flex overflow-hidden">
        <Ripple mainCircleSize={110} className="opacity-40" />
        <TechOrbitDisplay
          text="HackerMate"
          subtext="FIND YOUR CO-BUILDERS"
        />
      </div>

      {/* Right Side: Clean OAuth Login Panel */}
      <div className="flex w-full flex-col justify-center px-6 py-8 sm:px-12 lg:w-1/2 z-10">
        <div className="mx-auto w-full max-w-sm space-y-5">

          {/* Header */}
          <div className="space-y-2">
            <BoxReveal boxColor="#B4F461" duration={0.3}>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {title}
              </h2>
            </BoxReveal>

            <BoxReveal boxColor="#22D3EE" duration={0.35}>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                {subtitle}
              </p>
            </BoxReveal>
          </div>

          {/* 1-Tap Google Button */}
          <BoxReveal boxColor="#B4F461" duration={0.3} width="100%" overflow="visible">
            <button
              onClick={() => handleOAuthSignIn("google")}
              disabled={!consentChecked || !!loadingProvider}
              className={cn(
                "group/btn relative flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-zinc-700/80 bg-zinc-900/90 px-4 font-semibold text-white shadow-lg transition-all duration-300 hover:border-zinc-500 hover:bg-zinc-850 hover:shadow-[0_0_20px_rgba(255,255,255,0.08)] disabled:opacity-40 disabled:cursor-not-allowed",
                !consentChecked && "opacity-40 cursor-not-allowed hover:border-zinc-700 hover:bg-zinc-900/90"
              )}
            >
              {/* Google 4-Color SVG Icon */}
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span className="text-sm font-medium">
                {loadingProvider === "google"
                  ? "Connecting to Google..."
                  : "Login with Google"}
              </span>
              <BottomGradient />
            </button>
          </BoxReveal>

          {/* Divider */}
          <BoxReveal boxColor="#27272a" duration={0.3} width="100%">
            <div className="flex items-center gap-4 my-0.5">
              <hr className="flex-1 border-t border-dashed border-zinc-800" />
              <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">or</p>
              <hr className="flex-1 border-t border-dashed border-zinc-800" />
            </div>
          </BoxReveal>

          {/* 1-Tap GitHub Button */}
          <BoxReveal boxColor="#22D3EE" duration={0.3} width="100%" overflow="visible">
            <button
              onClick={() => handleOAuthSignIn("github")}
              disabled={!consentChecked || !!loadingProvider}
              className={cn(
                "group/btn relative flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 font-semibold text-white shadow-lg transition-all duration-300 hover:border-zinc-600 hover:bg-zinc-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.12)] disabled:opacity-40 disabled:cursor-not-allowed",
                !consentChecked && "opacity-40 cursor-not-allowed hover:border-zinc-800 hover:bg-zinc-900/60"
              )}
            >
              {/* GitHub SVG Icon */}
              <svg className="h-5 w-5 fill-current shrink-0 text-white" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span className="text-sm font-medium">
                {loadingProvider === "github"
                  ? "Connecting to GitHub..."
                  : "Login with GitHub"}
              </span>
              <BottomGradient />
            </button>
          </BoxReveal>

          {/* 18+ Terms & Privacy Consent Checkbox (Below buttons) */}
          <BoxReveal boxColor="#B4F461" duration={0.3} width="100%">
            <div className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-xl mt-1">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-[#B4F461] focus:ring-[#B4F461] cursor-pointer shrink-0 accent-[#B4F461]"
                />
                <span className="text-[11px] text-zinc-400 leading-relaxed">
                  I confirm that I am 18 years or older, and I agree to the{" "}
                  <a href="/terms" target="_blank" className="text-[#B4F461] hover:underline">Terms of Service</a>{" "}
                  and{" "}
                  <a href="/privacy" target="_blank" className="text-[#B4F461] hover:underline">Privacy Policy</a>.
                </span>
              </label>
            </div>
          </BoxReveal>

        </div>
      </div>
    </div>
  );
}

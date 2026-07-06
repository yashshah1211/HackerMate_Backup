"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setEmail(user.email ?? null);

      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      console.log("Landing page - Profile check:", { userId: user.id, data, error });

      if (data) {
        const requestedPath = new URLSearchParams(window.location.search).get("next");
        const safePath =
          requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
            ? requestedPath
            : "/dashboard";
        console.log("Landing page - Redirecting to:", safePath);
        router.push(safePath);
      } else {
        console.log("Landing page - Redirecting to onboarding");
        router.push("/onboarding");
      }
    }

    checkUser();
  }, [router]);

  async function signInWithGoogle() {
    const requestedPath = new URLSearchParams(window.location.search).get("next");
    const callbackUrl = new URL("/", window.location.origin);
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
      callbackUrl.searchParams.set("next", requestedPath);
    }

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
  }

  async function signInWithGithub() {
    const requestedPath = new URLSearchParams(window.location.search).get("next");
    const callbackUrl = new URL("/", window.location.origin);
    if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
      callbackUrl.searchParams.set("next", requestedPath);
    }

    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: callbackUrl.toString() },
    });
  }

  if (loading && email) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--primary-500)] to-[var(--accent-500)] animate-pulse" />
          <p className="text-zinc-500 text-sm">Loading your workspace...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col justify-between">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-24 md:py-32">
        <div className="max-w-xl mx-auto text-center">
          {/* Logo */}
          <div className="mb-8 animate-fade-in-up">
            <div className="inline-flex items-center justify-center mb-6">
              <div className="w-12 h-12 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-xl text-white">
                H
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-2">
              HackerMate
            </h1>

            <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em]">
              Team Operating System
            </p>
          </div>

          {/* Headline */}
          <div className="space-y-4 animate-fade-in-up stagger-1">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-white leading-tight">
              Build teams. Ship projects.
            </h2>

            <p className="text-sm md:text-base text-zinc-400 max-w-md mx-auto leading-relaxed">
              Find teammates, discover hackathons, and collaborate with builders
              who share your vision.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-10 animate-fade-in-up stagger-2 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto px-4">
            <button
              onClick={signInWithGoogle}
              className="w-full sm:w-auto group inline-flex items-center justify-center gap-2.5 btn btn-lg btn-primary"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.19 15.01 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="font-medium text-sm">Continue with Google</span>
            </button>

            <button
              onClick={signInWithGithub}
              className="w-full sm:w-auto group inline-flex items-center justify-center gap-2.5 btn btn-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 text-white transition-all duration-205"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                />
              </svg>
              <span className="font-medium text-sm">Continue with GitHub</span>
            </button>
          </div>

          <p className="mt-6 text-xs text-zinc-500 animate-fade-in-up stagger-2">
            Join hundreds of builders already collaborating
          </p>
        </div>
      </div>

      {/* Features preview */}
      <div className="w-full border-t border-zinc-800 bg-zinc-900/10">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.03a c0 .375-.04.748-.12 1.11-.143.77-.39 1.508-.731 2.19a7.49 7.49 0 01-5.374 4.08 7.184 7.184 0 01-6.657-2.12 7.49 7.49 0 01-.834-3.52m0 0V15a3 3 0 013-3h1.5m-1.5 4.5V16.5a3 3 0 013-3h1.5M10.5 8.5v-1.5a3 3 0 016 0v1.5m-6 0h6m6 0v.75a3 3 0 01-3 3h-1.5m0 0v-1.5a3 3 0 013-3h1.5"
                    />
                  </svg>
                ),
                title: "Find Teammates",
                description:
                  "Discover developers with the skills you need for your next project.",
              },
              {
                icon: (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 21h19.5m-18-18v18m10.5-8.5h.25a.25.25 0 01.25.25v.25a.25.25 0 01-.25.25h-.25a.25.25 0 01-.25-.25v-.25a.25.25 0 01.25-.25zm-4.5 2.5h.25a.25.25 0 01.25.25v4.25a.25.25 0 01-.25.25h-.25a.25.25 0 01-.25-.25v-4.25a.25.25 0 01.25-.25zm8.5-2.5h.25a.25.25 0 01.25.25v.25a.25.25 0 01-.25.25h-.25a.25.25 0 01-.25-.25v-.25a.25.25 0 01.25-.25zm4.5 0h.25a.25.25 0 01.25.25v.25a.25.25 0 01-.25.25h-.25a.25.25 0 01-.25-.25v-.25a.25.25 0 01.25-.25zm-4.5 6.5h.25a.25.25 0 01.25.25v1.75a.25.25 0 01-.25.25h-.25a.25.25 0 01-.25-.25v-1.75a.25.25 0 01.25-.25z"
                    />
                  </svg>
                ),
                title: "Create Teams",
                description:
                  "Build your dream team with detailed skill requirements and roles.",
              },
              {
                icon: (
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.5 18h1.5m4.5-13.764c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.5 18h-1.5"
                    />
                  </svg>
                ),
                title: "Discover Hackathons",
                description:
                  "Find upcoming events and teams looking for members like you.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="card card-static p-5 group"
              >
                <div className="inline-flex items-center justify-center w-9 h-9 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-white group-hover:border-zinc-700 transition-colors mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

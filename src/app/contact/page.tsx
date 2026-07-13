"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import Logo from "@/components/Logo";

export default function ContactPage() {
  const { showToast } = useNotification();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [botCheck, setBotCheck] = useState(""); // Honeypot field
  
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function loadUserProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsAuthenticated(true);
        setEmail(user.email || "");
        
        // Fetch user profile details for the name
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        if (profile?.full_name) {
          setName(profile.full_name);
        }
      }
    }
    loadUserProfile();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validations
    if (!name.trim()) {
      showToast("Please enter your name.", "warning");
      return;
    }
    if (!email.trim()) {
      showToast("Please enter your email address.", "warning");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showToast("Please enter a valid email address.", "warning");
      return;
    }
    if (!subject.trim()) {
      showToast("Please enter a subject.", "warning");
      return;
    }
    if (message.trim().length < 10) {
      showToast("Message must be at least 10 characters long.", "warning");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          bot_check: botCheck, // Honeypot field
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        showToast(result.error || "Failed to submit inquiry.", "error");
      } else {
        setSubmitted(true);
        showToast("Inquiry sent successfully!", "success");
        // Reset form inputs (if guests want to send another message)
        if (!isAuthenticated) {
          setName("");
          setEmail("");
        }
        setSubject("");
        setMessage("");
      }
    } catch (err) {
      console.error("Error submitting contact form:", err);
      showToast("An unexpected error occurred. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,rgba(180,244,97,0.03),transparent_50%)] relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(180,244,97,0.02),transparent_40%)] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex items-center cursor-pointer">
            <Logo className="h-9 w-auto" />
          </Link>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-950/40 backdrop-blur-md border border-zinc-900/80 p-6 md:p-8 rounded-2xl shadow-xl">
          {submitted ? (
            <div className="text-center py-6 space-y-4 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-500 mb-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white tracking-tight">Message Sent!</h2>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
                Thank you for contacting us. We've received your inquiry and our support team will get back to you shortly.
              </p>
              <div className="pt-4">
                <button
                  onClick={() => setSubmitted(false)}
                  className="btn btn-secondary text-xs py-1.5 px-4 cursor-pointer"
                >
                  Send another message
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold text-white tracking-tight mb-1">Contact Us</h1>
                <p className="text-xs text-zinc-500">Have questions or feedback? Drop us a line.</p>
              </div>

              {/* Honeypot field - completely hidden from screen readers and visual space */}
              <div className="hidden" aria-hidden="true">
                <input
                  type="text"
                  name="bot_check"
                  value={botCheck}
                  onChange={(e) => setBotCheck(e.target.value)}
                  placeholder="Do not fill this out if you are human"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* Name Field */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  Your Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Yash Shah"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isAuthenticated && name !== ""}
                  className="input text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                />
              </div>

              {/* Email Field */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  Email Address *
                </label>
                <input
                  type="email"
                  placeholder="e.g. yash@hackermate.dev"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isAuthenticated}
                  className="input text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                />
              </div>

              {/* Subject Field */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  Subject *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Question about team creation"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="input text-xs"
                  required
                />
              </div>

              {/* Message Field */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  Message *
                </label>
                <textarea
                  placeholder="Write your inquiry here..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="input text-xs resize-none"
                  required
                />
                <p className="text-[9px] text-zinc-600 font-mono">Minimum 10 characters.</p>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn btn-primary text-xs py-2 px-5 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Back Link */}
        <div className="flex justify-between items-center mt-6 px-2 text-xs">
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
            className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1 font-medium"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span>Back to {isAuthenticated ? "Dashboard" : "Home"}</span>
          </Link>
          <span className="text-zinc-700">|</span>
          <p className="text-zinc-600 font-mono text-[10px]">HackerMate Support</p>
        </div>
      </div>
    </main>
  );
}

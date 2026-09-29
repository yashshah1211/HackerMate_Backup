"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/context/NotificationContext";
import { Button, FieldLabel, Input, Textarea } from "@/components/system";
import { Container, Eyebrow, Lede } from "@/components/landing/primitives";

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

  const backHref = isAuthenticated ? "/dashboard" : "/";

  return (
    <main data-v2 className="border-b border-line">
      <Container className="grid grid-cols-1 gap-10 py-14 md:py-20 lg:grid-cols-12 lg:gap-14">
        {/* Intro */}
        <header className="min-w-0 lg:col-span-5">
          <Eyebrow>HackerMate support</Eyebrow>
          <h1
            data-v2-heading
            className="mt-4 font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink text-balance [font-variation-settings:'wdth'_88] md:text-[46px]"
          >
            Contact Us
          </h1>
          <Lede className="mt-5">Have questions or feedback? Drop us a line.</Lede>

          <dl className="mt-8 divide-y divide-line border-y border-line text-[14px]">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <dt className="caps-label text-ink-3">Email</dt>
              <dd className="min-w-0">
                <a
                  href="mailto:contacthackermate@gmail.com"
                  className="inline-flex min-h-9 items-center gap-1.5 break-all font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                >
                  <Mail className="size-4 shrink-0 text-ink-3" aria-hidden />
                  contacthackermate@gmail.com
                </a>
              </dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <dt className="caps-label text-ink-3">Common questions</dt>
              <dd>
                <Link
                  href="/faq"
                  className="inline-flex min-h-9 items-center font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                >
                  Read the FAQ
                </Link>
              </dd>
            </div>
          </dl>

          <Link
            href={backHref}
            className="mt-6 inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to {isAuthenticated ? "Dashboard" : "Home"}
          </Link>
        </header>

        {/* Form */}
        <div className="min-w-0 lg:col-span-7">
          <div className="rounded-lg border border-line bg-raised p-5 md:p-7">
            {submitted ? (
              <div className="flex flex-col items-center py-8 text-center" role="status">
                <span className="inline-flex size-11 items-center justify-center rounded-md bg-ok-soft text-ok">
                  <CheckCircle2 className="size-5" aria-hidden />
                </span>
                <h2 className="mt-4 text-[17px] font-semibold text-ink">Message Sent!</h2>
                <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-2">
                  Thank you for contacting us. We&apos;ve received your inquiry and our support team will get back to you shortly.
                </p>
                <Button variant="secondary" className="mt-6 h-10" onClick={() => setSubmitted(false)}>
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink">Send a message</h2>
                  <p className="mt-1 text-[13px] text-ink-3">All fields are required.</p>
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

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {/* Name Field */}
                  <div className="min-w-0">
                    <FieldLabel htmlFor="contact-name">Your Name *</FieldLabel>
                    <Input
                      id="contact-name"
                      type="text"
                      placeholder="e.g. Yash Shah"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isAuthenticated && name !== ""}
                      className="h-10 disabled:cursor-not-allowed"
                      autoComplete="name"
                      required
                    />
                  </div>

                  {/* Email Field */}
                  <div className="min-w-0">
                    <FieldLabel htmlFor="contact-email">Email Address *</FieldLabel>
                    <Input
                      id="contact-email"
                      type="email"
                      placeholder="e.g. yash@hackermate.dev"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isAuthenticated}
                      className="h-10 disabled:cursor-not-allowed"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                {/* Subject Field */}
                <div>
                  <FieldLabel htmlFor="contact-subject">Subject *</FieldLabel>
                  <Input
                    id="contact-subject"
                    type="text"
                    placeholder="e.g. Question about team creation"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="h-10"
                    required
                  />
                </div>

                {/* Message Field */}
                <div>
                  <FieldLabel htmlFor="contact-message" hint="Minimum 10 characters.">
                    Message *
                  </FieldLabel>
                  <Textarea
                    id="contact-message"
                    placeholder="Write your inquiry here..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={6}
                    className="resize-none text-[14px]"
                    required
                  />
                </div>

                {/* Submit Button */}
                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={loading}
                    icon={loading ? undefined : <Send aria-hidden />}
                    className="w-full sm:w-auto"
                  >
                    {loading ? "Sending..." : "Send Message"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}

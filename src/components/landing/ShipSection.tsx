"use client";

import { useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Mail } from "lucide-react";
import { Button, ButtonLink, Dialog } from "@/components/system";
import { useNotification } from "@/context/NotificationContext";
import { cn } from "@/lib/utils";
import { Container, STAGES, StageLabel } from "./primitives";

const CONTACT_EMAIL = "contacthackermate@gmail.com";

/** Organizer inquiries (kept from V1: email, Gmail compose, copy). */
export function OrganizerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useNotification();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      showToast(`Copied ${CONTACT_EMAIL} to clipboard!`, "success");
      window.setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error("[landing] copy email failed:", err);
      showToast("Couldn't copy. The address is shown above.", "error");
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="List your hackathon on HackerMate"
      description="Listing is free for college and community hackathons. Email us and we'll help participants find their teams."
      footer={
        <>
          <Button variant="ghost" icon={copied ? <Check /> : <Copy />} onClick={copy}>
            {copied ? "Copied" : "Copy email"}
          </Button>
          <a
            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${CONTACT_EMAIL}&su=Partner+Hackathon+with+HackerMate`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded-md bg-accent px-3.5 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent-hover [&_svg]:size-4"
          >
            Open in Gmail <ExternalLink />
          </a>
        </>
      }
    >
      <div className="flex items-center gap-2.5 rounded-md bg-sunken px-3 py-2.5 ring-1 ring-inset ring-line">
        <Mail className="size-4 shrink-0 text-ink-3" aria-hidden />
        <span className="select-all break-all font-mono text-[13px] text-ink">{CONTACT_EMAIL}</span>
      </div>
    </Dialog>
  );
}

/** 05 — the run passes: the page resolves into the brand and the signup. */
export function ShipSection({ onOrganizer }: { onOrganizer: () => void }) {
  return (
    <section id="ship" data-stage="ship" aria-labelledby="ship-title" className="scroll-mt-16">
      <Container className="pt-16 md:pt-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <StageLabel id="ship" />
          <ol aria-label="Pipeline status" className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px]">
            {STAGES.map((s, i) => {
              const last = i === STAGES.length - 1;
              return (
                <li key={s.id} className={cn("inline-flex items-center gap-1.5", last ? "text-accent-ink" : "text-ink-3")}>
                  {last ? (
                    <span aria-hidden className="size-2 rounded-[2px] bg-accent" />
                  ) : (
                    <Check className="size-3.5 text-ok" aria-hidden />
                  )}
                  {s.verb.toLowerCase()}
                  <span className="sr-only">{last ? " (you are here)" : " (done)"}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-10 grid grid-cols-1 items-end gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <h2
              id="ship-title"
              data-v2-heading
              className="font-display text-[46px] font-semibold leading-[0.96] tracking-[-0.028em] text-ink text-balance [font-variation-settings:'wdth'_88] sm:text-[64px] lg:text-[88px]"
            >
              Ship with people who ship.
            </h2>
            <p className="mt-6 max-w-[48ch] text-[16.5px] leading-[1.6] text-ink-2 md:text-[18px]">
              Free for students. Sign in with Google or GitHub, set up your builder profile, and start forming your team before the next deadline.
            </p>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <ButtonLink href="/login" variant="primary" size="lg" iconRight={<ArrowRight />} className="w-full sm:w-auto">
                Find teammates
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" size="lg" className="w-full sm:w-auto">
                Sign in
              </ButtonLink>
            </div>
          </div>
          <div className="lg:col-span-4">
            <div className="rounded-xl border border-line p-5">
              <p className="caps-label text-ink-3">Organising a hackathon?</p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
                List it for free and give participants one place to find teammates, form teams and build.
              </p>
              <Button variant="secondary" className="mt-4" iconRight={<ArrowRight />} onClick={onOrganizer}>
                Talk to us
              </Button>
            </div>
          </div>
        </div>
      </Container>

      {/* Sign-off: the brand, set large. */}
      <div aria-hidden className="mt-20 select-none overflow-hidden border-t border-line md:mt-28">
        <Container className="flex items-end gap-[2vw] pb-6 pt-10 md:pb-8 md:pt-14">
          {/* Display sizes need looser tracking than the 36px rail mark, or glyphs collide. */}
          <span className="inline-flex aspect-square w-[clamp(40px,10.5vw,148px)] shrink-0 items-center justify-center rounded-[18%] bg-accent font-display text-[clamp(17px,4.4vw,62px)] font-extrabold leading-none tracking-[-0.02em] text-on-accent [font-variation-settings:'wdth'_88]">
            hm
          </span>
          <span className="font-display text-[clamp(44px,12.5vw,176px)] font-semibold leading-[0.8] tracking-[-0.012em] text-ink [font-variation-settings:'wdth'_90]">
            HackerMate
          </span>
        </Container>
      </div>
    </section>
  );
}

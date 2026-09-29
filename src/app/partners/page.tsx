import { Bot, Users, Award, ShieldCheck, ArrowRight, MessageSquareCode } from "lucide-react";
import { ButtonLink } from "@/components/system";
import { Container, Eyebrow, Lede, SectionTitle } from "@/components/landing/primitives";

export const metadata = {
  title: "Partner & Organizer Solutions | HackerMate",
  description: "Official team-building operating system, Discord Team Finder Bot, and co-branded portals for hackathon organizers.",
};

const codeClass = "rounded-[4px] bg-sunken px-1.5 py-0.5 font-mono text-[13px] text-ink ring-1 ring-inset ring-line";

const FEATURES = [
  {
    icon: Users,
    title: "Automated Matchmaking",
    body: "Jaccard similarity scoring pairs participants based on complementary frontend, backend, AI/ML, and design skills.",
  },
  {
    icon: ShieldCheck,
    title: "Co-branded Event Portals",
    body: (
      <>
        Get a custom URL (<code className={codeClass}>/partners/your-hackathon</code>) with custom banners, logo, and submission tracking.
      </>
    ),
  },
  {
    icon: Award,
    title: "Verified Certificates",
    body: "Issue cryptographic PDF certificates for winners and participants with public verification URLs.",
  },
];

export default function PartnersPage() {
  const discordClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;

  return (
    <main data-v2>
      {/* Header */}
      <section className="border-b border-line">
        <Container className="py-14 md:py-20">
          <Eyebrow>For hackathon organizers & tech fests</Eyebrow>
          <h1
            data-v2-heading
            className="mt-5 max-w-[18ch] font-display text-[36px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink text-balance [font-variation-settings:'wdth'_88] md:text-[56px]"
          >
            Team formation for your hackathon
          </h1>
          <Lede className="mt-5">
            Help solo developers form balanced, high-skill teams in minutes with HackerMate&apos;s Discord Bot and custom event hubs.
          </Lede>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* ButtonLink (a client component) rather than buttonClass(): this is a
                server component and cannot call functions exported from a client module. */}
            <ButtonLink href="/contact" variant="primary" size="lg">
              Request Organizer Access <ArrowRight aria-hidden />
            </ButtonLink>
            {discordClientId && (
              <ButtonLink
                href={`https://discord.com/api/oauth2/authorize?client_id=${discordClientId}&scope=bot%20applications.commands`}
                target="_blank"
                rel="noreferrer"
                variant="secondary"
                size="lg"
              >
                <Bot aria-hidden /> Add Bot to Your Discord
              </ButtonLink>
            )}
          </div>
        </Container>
      </section>

      {/* Discord bot */}
      <section aria-labelledby="partners-bot-title" className="border-b border-line">
        <Container className="grid grid-cols-1 gap-10 py-14 md:py-20 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-6">
            <Eyebrow>HackerMate Discord Bot · Prototype</Eyebrow>
            <SectionTitle id="partners-bot-title" className="mt-4 md:text-[40px]">
              Zero-Spam Team Matching Inside Your Hackathon Discord
            </SectionTitle>
            <p className="mt-5 max-w-[60ch] text-[15px] leading-[1.7] text-ink-2">
              Eliminate noisy <code className={codeClass}>#looking-for-team</code> channels. The HackerMate Discord bot handles slash commands like{" "}
              <code className={codeClass}>/find-team</code> and <code className={codeClass}>/create-team</code>, posting rich interactive cards that link solo devs straight to compatible teams on HackerMate.
            </p>
          </div>

          <ul className="min-w-0 divide-y divide-line self-end border-y border-line lg:col-span-6">
            <li className="flex items-start gap-3.5 py-5">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-selected text-ink-2">
                <MessageSquareCode className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-ink">Slash Command Matching</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-3">Users search open teams by role or tech stack directly in chat.</p>
              </div>
            </li>
            <li className="flex items-start gap-3.5 py-5">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-selected text-ink-2">
                <Users className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-ink">1-Click HMAC Invite Links</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-3">Instant friction-free team joins without manual approval bottlenecks.</p>
              </div>
            </li>
          </ul>
        </Container>
      </section>

      {/* Organizer features */}
      <section aria-labelledby="partners-features-title" className="border-b border-line">
        <Container className="py-14 md:py-20">
          <Eyebrow>What organizers get</Eyebrow>
          <SectionTitle id="partners-features-title" className="mt-4 md:text-[40px]">
            Built for event teams
          </SectionTitle>
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="min-w-0 bg-canvas p-6">
                <Icon className="size-5 text-accent-ink" aria-hidden />
                <h3 className="mt-4 text-[16px] font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-3">{body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section aria-labelledby="partners-cta-title" className="border-b border-line">
        <Container className="flex flex-col gap-6 py-14 md:flex-row md:items-end md:justify-between md:py-20">
          <div className="min-w-0">
            <SectionTitle id="partners-cta-title" className="md:text-[40px]">
              Hosting a Hackathon Soon?
            </SectionTitle>
            <Lede className="mt-4">
              Partner with HackerMate to increase participant completion rates and streamline team management.
            </Lede>
          </div>
          <ButtonLink href="/contact" variant="primary" size="lg" className="self-start md:self-auto">
            Get Started as a Partner <ArrowRight aria-hidden />
          </ButtonLink>
        </Container>
      </section>
    </main>
  );
}

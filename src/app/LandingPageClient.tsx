"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUpRight, Building2, CheckCircle2, Cpu, GitCommitHorizontal, GitPullRequest, Layers, Mail, MapPin, Pause, Play, Radio, ShieldCheck, Target, Terminal, Trophy, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { LandingData } from "@/lib/getLandingData";
import { getInitials } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import VerifiedBuilderBadge from "@/components/VerifiedBuilderBadge";
import { WarRoomCanvas } from "@/components/landing/war-room-canvas";
import { MatchSimulator } from "@/components/landing/match-simulator";
import styles from "@/components/landing/landing.module.css";

const contact = "contacthackermate@gmail.com";
const formatCount = (count: number) => new Intl.NumberFormat("en-IN").format(Math.max(0, count || 0));

export function LandingPageClient({ initialData }: { initialData: LandingData }) {
  const router = useRouter();
  const [organizerOpen, setOrganizerOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  // Preserve the authenticated landing handoff without subscribing public visitors to raw profile inserts.
  useEffect(() => {
    let cancelled = false;
    async function handoff() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) { if (authError.name !== "AuthSessionMissingError") console.error("Landing session check failed:", authError); return; }
        if (!user || cancelled) return;
        const { data, error } = await supabase.from("profiles").select("onboarding_completed").eq("id", user.id).maybeSingle();
        if (error) { console.error("Landing onboarding query failed:", error); return; }
        const requested = new URLSearchParams(window.location.search).get("next");
        const target = requested && /^\/(?!\/)/.test(requested) && !/[\\\u0000-\u001f]/.test(requested) ? requested : "/dashboard";
        if (!cancelled) router.replace(data?.onboarding_completed ? target : `/onboarding?next=${encodeURIComponent(target)}`);
      } catch (error) { console.error("Landing session handoff failed:", error); }
    }
    void handoff();
    return () => { cancelled = true; };
  }, [router]);
  const builders = initialData.builders.slice(0, 8);
  const hackathons = initialData.hackathons.slice(0, 8);
  const teams = initialData.teams.slice(0, 3);

  return <main className={styles.landing}>
    <section className={styles.hero} aria-labelledby="landing-title">
      <div className={styles.heroGrid} aria-hidden="true"/>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><span className={styles.limeDot}/> THE OPERATING SYSTEM FOR BUILDERS</span>
          <h1 id="landing-title">Great ideas<br/>need <span>great teams.</span></h1>
          <p>Find your missing piece. Build in sync.<br className={styles.desktopBreak}/> Turn a weekend of ambition into something real.</p>
          <div className={styles.heroActions}><Link href="/developers" className={`${buttonVariants({ size: "lg" })} ${styles.primaryLink}`}>Find your people <ArrowUpRight size={18}/></Link><Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "lg" })}>Enter HackerMate <ArrowRight size={17}/></Link></div>
          <div className={styles.heroProof}><div className={styles.avatarStack}>{builders.slice(0, 4).map(builder => <span key={builder.id} title={builder.full_name || "Builder"}>{getInitials(builder.full_name)}</span>)}</div><span>Built for the people who build.<small>Discovery, teams & workspaces. Always free.</small></span></div>
        </div>
        <WarRoomCanvas/>
      </div>
      <div className={styles.heroBottom}><span><Terminal size={13}/> LESS COORDINATION. MORE CREATION.</span><a href="#match-lab">Explore the system <ArrowDown size={14}/></a></div>
    </section>

    <section className={styles.stats} aria-label="HackerMate network totals">
      {[[initialData.userCount, "BUILDERS", Users], [initialData.teamCount, "TEAMS FORMED", Layers], [initialData.hackathonCount, "EVENTS IN THE DIRECTORY", Trophy]].map(([count, label, Icon]) => {
        const StatIcon = Icon as typeof Users;
        return <div key={String(label)}><StatIcon size={16}/><strong>{formatCount(count as number)}</strong><span>{String(label)}</span></div>;
      })}
      <div><span className={styles.limeDot}/><span>REAL PEOPLE.<br/>REAL POSSIBILITIES.</span></div>
    </section>

    <section id="match-lab" className={styles.section}>
      <div className={styles.splitHeading}><div><span className={styles.eyebrow}>01 / FIND YOUR COMPLEMENT</span><h2>You don’t need<br/>another you.</h2></div><p>A frontend mind. A backend problem-solver. Someone who sees the whole experience. Different strengths make better teams.</p></div>
      <MatchSimulator/>
    </section>

    <section className={styles.section} aria-labelledby="system-heading">
      <div className={styles.sectionHeading}><span className={styles.eyebrow}>02 / FROM HELLO TO HELLO WORLD</span><h2 id="system-heading">Your ambition.<br/>An entire system behind it.</h2><p>Meet the team. Make the thing. Show your work.</p></div>
      <div className={styles.featureGrid}>
        <Card className={styles.featureCard}><CardHeader><span className={styles.featureIcon}><Target size={23}/></span><Badge className="w-fit">01 — CONNECT</Badge><CardTitle className="text-xl">Matchmaking v2</CardTitle></CardHeader><CardContent><p>Complementary skill vectors, a shared foundation, and room to grow. A team that adds to what you bring.</p><div className={styles.vectorVisual} aria-hidden="true"><span>FRONTEND</span><i/><span>BACKEND</span><i/><span>DESIGN</span></div><Link href="/developers">Explore builders <ArrowUpRight size={16}/></Link></CardContent></Card>
        <Card className={styles.featureCard}><CardHeader><span className={styles.featureIcon}><Layers size={23}/></span><Badge className="w-fit">02 — CREATE</Badge><CardTitle className="text-xl">The Hacker War Room</CardTitle></CardHeader><CardContent><p>Kanban, live docs, team conversations and an AI Pitch Deck Evaluator. Keep your momentum in one place.</p><div className={styles.miniTerminal}><span><span className={styles.limeDot}/> workspace / ready</span><code><b>→</b> ideas.capture()<br/><b>→</b> team.collaborate()<br/><b>→</b> project.ship()</code></div><Link href="/teams">Find your next team <ArrowUpRight size={16}/></Link></CardContent></Card>
        <Card className={styles.featureCard}><CardHeader><span className={styles.featureIcon}><ShieldCheck size={23}/></span><Badge className="w-fit">03 — PROVE</Badge><CardTitle className="text-xl">Proof beyond a résumé</CardTitle></CardHeader><CardContent><p>Show the demo and the contribution behind it. Frozen commit reviews and issuer evidence in our candidate-approved hiring pilot.</p><div className={styles.proofVisual}><span><GitCommitHorizontal size={16}/> Frozen repository snapshot</span><span><GitPullRequest size={16}/> Contribution breakdown</span><span><CheckCircle2 size={16}/> Issuer badge evidence</span></div><Link href="/contact">Explore the evidence pilot <ArrowUpRight size={16}/></Link></CardContent></Card>
      </div>
    </section>

    <section className={styles.networkSection} aria-labelledby="network-heading">
      <div className={styles.networkHeading}><div><span className={styles.eyebrow}><Radio size={14}/> THE NETWORK</span><h2 id="network-heading">Your next “let’s build.”</h2></div><Link href="/developers">Meet the builders <ArrowUpRight size={16}/></Link></div>
      {builders.length ? <div className={styles.builderGrid}>{builders.slice(0, 4).map(builder => <Link key={builder.id} href={`/profile/${builder.id}`} className={styles.builderCard}><div className={styles.builderTop}><span className={styles.builderAvatar}>{getInitials(builder.full_name)}</span><ArrowUpRight size={15}/></div><h3>{builder.full_name || "HackerMate builder"}</h3><VerifiedBuilderBadge profile={builder}/><p>{builder.college || "Independent builder"}</p><div>{builder.skills?.slice(0, 3).map(skill => <Badge key={skill}>{skill}</Badge>)}</div></Link>)}</div> : <div className={styles.networkEmpty}><Users size={24}/><p>The next connection starts with you.</p><Link href="/developers">Explore the builder directory <ArrowRight size={15}/></Link></div>}
      <p className={styles.dataNote}>From the HackerMate directory. “Verified” badges indicate profile completeness, not identity or employment verification.</p>
      <div className={styles.tickerHeader}><span className={styles.mono}>ON THE EVENT RADAR</span>{hackathons.length > 0 && <Button size="xs" variant="ghost" onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? <Play/> : <Pause/>}{paused ? "Resume ticker" : "Pause ticker"}</Button>}</div>
      {hackathons.length ? <div className={styles.tickerViewport}><div className={styles.ticker} style={{ animationPlayState: paused ? "paused" : undefined }}>{[0, 1].map(copy => <div className={styles.tickerGroup} key={copy} aria-hidden={copy === 1 ? true : undefined}>{hackathons.map(event => <Link tabIndex={copy ? -1 : undefined} key={event.id} href={`/hackathons/${event.id}`} className={styles.eventChip}><Trophy size={18}/><span><b>{event.name}</b><small><MapPin size={10}/>{event.location || event.mode || "See event details"}</small></span><ArrowUpRight size={14}/></Link>)}</div>)}</div></div> : <p className={styles.dataNote}>Find your next deadline in the <Link href="/hackathons">hackathon directory →</Link></p>}
      {teams.length > 0 && <div className={styles.teamRow}><span className={styles.mono}>MEET THE TEAMS</span>{teams.map(team => <Link key={team.id} href={`/teams/${team.id}`}><Layers size={14}/>{team.name}<span>View & apply <ArrowUpRight size={12}/></span></Link>)}</div>}
    </section>

    <section className={styles.organizer} aria-labelledby="organizer-heading"><div className={styles.organizerPattern} aria-hidden="true"/><div className={styles.organizerCopy}><span className={styles.eyebrow}><Building2 size={15}/> FOR THE PEOPLE BEHIND DEMO DAY</span><h2 id="organizer-heading">Run the event.<br/>We’ll help form the teams.</h2><p>Fewer unformed teams. Cleaner submissions. A calmer committee.<br/>Assisted Event Operations for your next campus hackathon.</p><div className={styles.organizerBenefits}><span><CheckCircle2 size={15}/> Two virtual formation clinics</span><span><CheckCircle2 size={15}/> Roster & submission QA</span><span><CheckCircle2 size={15}/> Approved certificate batch</span></div><Button size="lg" onClick={() => setOrganizerOpen(true)} className={styles.organizerButton}>Let’s talk about your event <ArrowUpRight size={18}/></Button><small>₹25,000 + applicable GST · Up to 200 participants / 50 teams · 10 delivery hours</small></div><div className={styles.organizerSeal} aria-hidden="true"><Cpu/><span>HUMAN<br/>AMBITION.<br/><b>BETTER<br/>SYSTEMS.</b></span></div></section>

    <footer className={styles.footer}><div><span className={styles.footerBrand}>HackerMate<span>/</span></span><p>Meet. Build. Ship. Repeat.</p></div><nav aria-label="Footer"><Link href="/hackathons">Hackathons</Link><Link href="/teams">Teams</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><span className={styles.mono}>BUILT FOR THE NEXT THING.</span></footer>
    <Dialog open={organizerOpen} onOpenChange={setOrganizerOpen} title="Make room for a better event." description="Tell us your event date, expected participation and who approves the operations budget." footer={<a className={`${buttonVariants()} ${styles.primaryLink}`} href={`mailto:${contact}?subject=${encodeURIComponent("Assisted Event Operations enquiry")}&body=${encodeURIComponent("Event / college:\nDemo date:\nExpected participants / teams:\nFaculty or budget approver:\nAvailable operations budget:\n")}`}>Email the team <Mail size={16}/></a>}>
      <div className={styles.modalOffer}><Badge variant="brand">Assisted Event Operations</Badge><strong>₹25,000 <span>+ applicable GST</span></strong><p>Approved co-branded onboarding, two virtual clinics, roster/submission QA, organizer-approved certificates with lookup, and a closing report.</p><p>Up to 200 participants / 50 teams, within 10 delivery hours. 50% deposit on signing; balance 48 hours before demo day.</p><p>Matching support, not guaranteed team placement. No onsite staffing, custom domains or judging dispute mediation.</p><a href={`mailto:${contact}`}>{contact}</a></div>
    </Dialog>
  </main>;
}

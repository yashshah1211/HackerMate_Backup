"use client";

import { useState } from "react";
import { ArrowRight, Plus, Search, UserPlus, Users } from "lucide-react";
import DevShell from "../DevShell";
import { DEV_BUILDERS } from "../fixtures";
import {
  Avatar,
  AvatarStack,
  Button,
  Chip,
  EmptyState,
  ErrorNotice,
  FilterChip,
  List,
  Page,
  PageHeader,
  Progress,
  RouteTabs,
  SearchField,
  SeatMeter,
  Section,
  Segmented,
  SkeletonRows,
  Stat,
  StatusDot,
  Switch,
  Tape,
  TeamMark,
} from "@/components/system";

export default function SystemGallery() {
  const [seg, setSeg] = useState<"fit" | "campus">("fit");
  const [q, setQ] = useState("");
  const [on, setOn] = useState(true);
  const [chips, setChips] = useState<string[]>(["React"]);

  return (
    <DevShell pathname="/developers">
      <Page>
        <PageHeader
          eyebrow="Design system · V2"
          title="Builders"
          meta="1,284 builders · 212 looking for a team"
          actions={
            <>
              <Button variant="secondary" icon={<Search />}>Search</Button>
              <Button variant="primary" icon={<Plus />}>New team</Button>
            </>
          }
          tabs={
            <RouteTabs
              tabs={[
                { href: "/dev/v2", label: "Discover", active: true },
                { href: "/dev/v2?x=1", label: "Your network", count: 18, active: false },
                { href: "/dev/v2?x=2", label: "Requests", count: 3, active: false },
              ]}
            />
          }
        />

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-10">
            <Section title="Type" count="scale">
              <div className="space-y-3">
                <p className="font-display text-[44px] font-semibold leading-none tracking-[-0.03em] [font-variation-settings:'wdth'_88]">Kabir Menon</p>
                <p className="font-display text-[26px] font-semibold tracking-[-0.02em]">Your teams need two things</p>
                <p className="text-[15px] text-ink">Body 15 — Full-stack builder. Shipped 4 hackathon projects.</p>
                <p className="text-[13.5px] text-ink-2">UI 13.5 — Looking for a backend dev who has shipped with Postgres.</p>
                <p className="text-[12.5px] text-ink-3">Meta 12.5 — IIT Madras · 3rd year · Active 2h ago</p>
                <p className="caps-label text-ink-3">Label · mono · uppercase</p>
              </div>
            </Section>

            <Section title="Buttons">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" icon={<UserPlus />}>Connect</Button>
                <Button variant="inverse">Message</Button>
                <Button variant="secondary">Invite to team</Button>
                <Button variant="ghost">Skip</Button>
                <Button variant="danger">Leave team</Button>
                <Button variant="primary" loading>Sending</Button>
                <Button variant="secondary" size="sm">Small</Button>
                <Button variant="primary" size="lg" iconRight={<ArrowRight />}>Open workspace</Button>
              </div>
            </Section>

            <Section title="Tape, chips, status">
              <div className="flex flex-wrap items-center gap-2">
                <Tape tone="ok" dot>Available</Tape>
                <Tape tone="accent">2 seats open</Tape>
                <Tape tone="solid">Owner</Tape>
                <Tape tone="hack">Hackathon</Tape>
                <Tape tone="hack">Hackathon</Tape>
                <Tape tone="proj">Project</Tape>
                <Tape tone="warn">Ends in 2d</Tape>
                <Tape tone="bad">Declined</Tape>
                <Tape>Pending</Tape>
                <Chip>TypeScript</Chip>
                <Chip active>React</Chip>
                <StatusDot tone="ok" pulse label="Online" />
              </div>
            </Section>

            <Section title="Builders for you" count={4} action={<Segmented label="View" size="sm" value={seg} onChange={setSeg} options={[{ value: "fit", label: "Best fit" }, { value: "campus", label: "Your campus", count: 2 }]} />}>
              <List stagger>
                {DEV_BUILDERS.map((b) => (
                  <li key={b.id} className="group flex items-center gap-3 py-3">
                    <Avatar name={b.full_name} size="md" presence={b.is_available ? "online" : null} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-ink">{b.full_name}</span>
                        {b.is_available && <Tape tone="ok">Available</Tape>}
                      </div>
                      <div className="mt-0.5 truncate text-[12.5px] text-ink-3">
                        {b.college} · {b.year_of_study}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {b.skills.slice(0, 4).map((s) => (
                          <Chip key={s} active={b.shared_skills.includes(s)}>
                            {s}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div className="hidden text-right sm:block">
                      <div className="font-display text-[20px] font-semibold leading-none tabular">{b.compatibility}</div>
                      <div className="caps-label mt-1 text-ink-4">fit</div>
                    </div>
                    <Button variant="secondary" size="sm" icon={<UserPlus />}>
                      Connect
                    </Button>
                  </li>
                ))}
              </List>
            </Section>

            <Section title="States">
              <div className="space-y-3">
                <EmptyState icon={<Users />} title="No teams yet" body="Start one for your next hackathon or ask to join a team that's recruiting." action={<><Button variant="primary" size="sm">Create a team</Button><Button variant="ghost" size="sm">Browse teams</Button></>} />
                <ErrorNotice detail="permission denied for table team_invites (42501)" onRetry={() => {}} />
                <SkeletonRows rows={2} />
              </div>
            </Section>
          </div>

          <aside className="space-y-8">
            <Section title="Controls">
              <div className="space-y-3">
                <SearchField value={q} onChange={setQ} placeholder="Search builders, skills, colleges" />
                <div className="flex flex-wrap gap-1.5">
                  {["React", "Python", "Figma", "ML", "Flutter"].map((c) => (
                    <FilterChip key={c} active={chips.includes(c)} onClick={() => setChips((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))}>
                      {c}
                    </FilterChip>
                  ))}
                </div>
                <label className="flex items-center justify-between text-[13px] text-ink-2">
                  Only available builders
                  <Switch checked={on} onChange={setOn} label="Only available builders" />
                </label>
              </div>
            </Section>

            <Section title="Team identity">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <TeamMark name="Null Pointers" tone="hack" size="lg" />
                  <div>
                    <div className="text-[14px] font-semibold">Null Pointers</div>
                    <SeatMeter filled={4} total={6} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <TeamMark name="Latency Zero" tone="hack" size="lg" />
                  <AvatarStack people={DEV_BUILDERS.map((b) => ({ id: b.id, name: b.full_name }))} max={3} />
                </div>
              </div>
            </Section>

            <Section title="Numbers">
              <div className="grid grid-cols-2 gap-5">
                <Stat label="Hackathons" value="7" hint="2 wins" />
                <Stat label="Teams" value="3" hint="1 recruiting" />
              </div>
              <div className="mt-5 space-y-1.5">
                <div className="flex justify-between text-[12.5px]"><span className="text-ink-2">Profile strength</span><span className="font-mono text-ink-3">80%</span></div>
                <Progress value={80} />
              </div>
            </Section>
          </aside>
        </div>
      </Page>
    </DevShell>
  );
}

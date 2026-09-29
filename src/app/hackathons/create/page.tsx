"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Link2, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AuthGuard from "@/components/AuthGuard";
import { useRouter as useAppRouter } from "next/navigation";
import { useNotification } from "@/context/NotificationContext";
import { COLLEGES } from "@/lib/colleges";
import { cn } from "@/lib/utils";
import { Button, FieldLabel, Input, Page, PageHeader, Select, Tape, Textarea } from "@/components/system";

export default function CreateHackathonPage() {
  const router = useAppRouter();
  const { showToast } = useNotification();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [mode, setMode] = useState("online");
  const [location, setLocation] = useState("");
  const [prizePool, setPrizePool] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [type, setType] = useState("external");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Team Size States
  const [teamPreset, setTeamPreset] = useState<"solo" | "1-3" | "2-4" | "custom">("2-4");
  const [minTeamSize, setMinTeamSize] = useState(2);
  const [maxTeamSize, setMaxTeamSize] = useState(4);

  // Hackathon Rounds States
  type RoundInput = {
    name: string;
    type: string;
    startDate: string;
    endDate: string;
    description: string;
  };

  const [roundsCount, setRoundsCount] = useState(1);
  const [rounds, setRounds] = useState<RoundInput[]>([
    {
      name: "Round 1: Idea & Proposal Submission",
      type: "Online Screening",
      startDate: "",
      endDate: "",
      description: "Submit your problem statement, solution deck, and project architecture.",
    },
  ]);

  const [college, setCollege] = useState("");
  const [customCollege, setCustomCollege] = useState("");
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);

  function handleRoundsCountChange(newCount: number) {
    setRoundsCount(newCount);
    setRounds((prev) => {
      const updated = [...prev];
      if (newCount > updated.length) {
        for (let i = updated.length; i < newCount; i++) {
          updated.push({
            name: `Round ${i + 1}: ${i === 1 ? "Prototype Building & Hackathon" : i === 2 ? "Final Pitch & Judging" : "Stage " + (i + 1)}`,
            type: i === 1 ? "Coding Phase" : i === 2 ? "Final Demo & Pitch" : "Online Screening",
            startDate: "",
            endDate: "",
            description: "",
          });
        }
      } else {
        return updated.slice(0, newCount);
      }
      return updated;
    });
  }

  function updateRoundField(idx: number, field: keyof RoundInput, val: string) {
    setRounds((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Please enter a hackathon name", "warning");
      return;
    }

    if (minTeamSize > maxTeamSize) {
      showToast("Minimum team size cannot be greater than maximum team size.", "warning");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        showToast("You must be logged in to create a hackathon.", "warning");
        setLoading(false);
        return;
      }

      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const initialStatus = type === "native" ? "pending" : "approved";

      const formattedRounds = rounds.map((r, i) => ({
        round_number: i + 1,
        name: r.name.trim() || `Round ${i + 1}`,
        type: r.type || "Online Screening",
        start_date: r.startDate || startDate || null,
        end_date: r.endDate || endDate || null,
        description: r.description.trim() || null,
      }));

      const { data: createdHackathon, error } = await supabase
        .from("hackathons")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
          location: mode === "online" ? "Online" : location.trim() || null,
          mode,
          prize_pool: prizePool.trim() || null,
          currency,
          website_url: websiteUrl.trim() || null,
          type,
          max_participants: maxParticipants ? parseInt(maxParticipants, 10) : null,
          min_team_size: minTeamSize,
          max_team_size: maxTeamSize,
          rounds_count: roundsCount,
          rounds_info: formattedRounds,
          tags: tags.length > 0 ? tags : null,
          organizer_id: user.id,
          college: college === "Other" ? customCollege.trim() || null : college || null,
          status: initialStatus,
          ai_feedback: { status: initialStatus, submitted_at: new Date().toISOString() },
        })
        .select()
        .single();

      if (error) {
        showToast(error.message, "error");
      } else {
        // Also sync stages table if native hackathon
        if (createdHackathon && type === "native" && formattedRounds.length > 0) {
          const stagesToInsert = formattedRounds.map((rd, i) => ({
            hackathon_id: createdHackathon.id,
            title: rd.name,
            description: rd.description,
            start_time: rd.start_date ? new Date(rd.start_date).toISOString() : new Date().toISOString(),
            end_time: rd.end_date ? new Date(rd.end_date).toISOString() : null,
            stage_type: rd.type.toLowerCase().includes("pitch") ? "ceremony" : rd.type.toLowerCase().includes("coding") ? "other" : "submission",
            sort_order: i + 1,
          }));
          const { error: stagesError } = await supabase.from("hackathon_stages").insert(stagesToInsert);
          if (stagesError) console.error("Failed to sync hackathon stages:", stagesError);
        }

        if (type === "native") {
          showToast("Native hackathon hosting request submitted! An admin will review and approve your listing shortly.", "success");
        } else {
          showToast("Hackathon listed successfully!", "success");
        }
        router.push("/hackathons");
      }
    } catch (err) {
      console.error(err);
      showToast("An error occurred while listing the hackathon.", "error");
    }

    setLoading(false);
  }


  const filteredColleges = COLLEGES.filter(
    (col) => col !== "Other" && col.toLowerCase().includes(collegeSearch.toLowerCase()),
  );

  const teamSizeSummary =
    teamPreset === "solo"
      ? "Solo only (1)"
      : teamPreset === "custom"
      ? `${minTeamSize}–${maxTeamSize} members`
      : teamPreset === "1-3"
      ? "1–3 members"
      : "2–4 members";

  return (
    <AuthGuard>
      <Page width="narrow">
        <PageHeader
          eyebrow="Host a hackathon"
          title="List your event"
          meta="Cross-list an external event, or run it natively with built-in team workspaces."
        />

        <form onSubmit={handleSubmit} className="mt-6 max-w-[720px] space-y-10">
          {/* Basics */}
          <FormSection title="Basics">
            <div>
              <FieldLabel htmlFor="hk-name">Hackathon name *</FieldLabel>
              <Input
                id="hk-name"
                type="text"
                required
                placeholder="e.g. AI Innovation Hackathon 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <fieldset>
              <legend className="mb-1.5 caps-label text-ink-3">Hosting mode *</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ChoiceCard
                  selected={type === "external"}
                  onSelect={() => setType("external")}
                  icon={<Link2 aria-hidden />}
                  title="Cross-list event"
                  tag="1-minute setup"
                  body="Post your Devfolio, Unstop or website link. Teammate matching happens on HackerMate; registrations stay on your portal."
                />
                <ChoiceCard
                  selected={type === "native"}
                  onSelect={() => setType("native")}
                  icon={<Zap aria-hidden />}
                  title="Host natively"
                  tag="Full suite"
                  body="Run registrations, announcements, resources, team workspaces and submissions directly on HackerMate."
                />
              </div>
            </fieldset>

            {type === "native" && (
              <div>
                <FieldLabel htmlFor="hk-capacity" hint="Optional">
                  Max participants
                </FieldLabel>
                <Input
                  id="hk-capacity"
                  type="number"
                  min="1"
                  placeholder="Leave empty for unlimited"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(e.target.value)}
                />
                <p className="mt-1.5 text-[12px] text-ink-3">
                  When capacity is reached, new registrants join the waitlist automatically.
                </p>
              </div>
            )}

            <div>
              <FieldLabel htmlFor="hk-description">Description</FieldLabel>
              <Textarea
                id="hk-description"
                placeholder="Themes, judges, rules and timelines"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[110px]"
              />
            </div>
          </FormSection>

          {/* Teams */}
          <FormSection
            title="Team size"
            action={
              <span className="flex items-center gap-2">
                {type === "native" && <Tape tone="ok">Enforced</Tape>}
                <span className="font-mono text-[12px] text-ink-2 tabular">{teamSizeSummary}</span>
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Team size preset">
              <PresetButton
                selected={teamPreset === "solo"}
                onSelect={() => {
                  setTeamPreset("solo");
                  setMinTeamSize(1);
                  setMaxTeamSize(1);
                }}
                label="Solo"
                sub="1 member"
              />
              <PresetButton
                selected={teamPreset === "1-3"}
                onSelect={() => {
                  setTeamPreset("1-3");
                  setMinTeamSize(1);
                  setMaxTeamSize(3);
                }}
                label="1 – 3"
                sub="members"
              />
              <PresetButton
                selected={teamPreset === "2-4"}
                onSelect={() => {
                  setTeamPreset("2-4");
                  setMinTeamSize(2);
                  setMaxTeamSize(4);
                }}
                label="2 – 4"
                sub="members"
              />
              <PresetButton
                selected={teamPreset === "custom"}
                onSelect={() => setTeamPreset("custom")}
                label="Custom"
                sub="range"
              />
            </div>

            {teamPreset === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="hk-min">Min members</FieldLabel>
                  <Input
                    id="hk-min"
                    type="number"
                    min="1"
                    max={maxTeamSize}
                    value={minTeamSize}
                    onChange={(e) => setMinTeamSize(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="hk-max">Max members</FieldLabel>
                  <Input
                    id="hk-max"
                    type="number"
                    min={minTeamSize}
                    max="20"
                    value={maxTeamSize}
                    onChange={(e) => setMaxTeamSize(Math.max(minTeamSize, parseInt(e.target.value) || minTeamSize))}
                  />
                </div>
              </div>
            )}
          </FormSection>

          {/* Rounds */}
          <FormSection
            title="Rounds"
            description="Set the number of rounds and the timeline for each stage."
            action={
              <label className="flex items-center gap-2">
                <span className="text-[12.5px] text-ink-3">Rounds</span>
                <Select
                  value={roundsCount}
                  onChange={(e) => handleRoundsCountChange(parseInt(e.target.value, 10))}
                  className="w-[88px]"
                  aria-label="Number of rounds"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </Select>
              </label>
            }
          >
            <ol className="divide-y divide-line rounded-lg border border-line bg-raised">
              {rounds.map((rd, idx) => (
                <li key={idx} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                      <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-selected font-mono text-[11.5px] text-ink-2 tabular">
                        {idx + 1}
                      </span>
                      Round {idx + 1}
                    </span>
                    <Select
                      value={rd.type}
                      onChange={(e) => updateRoundField(idx, "type", e.target.value)}
                      className="w-full sm:w-[230px]"
                      aria-label={`Round ${idx + 1} type`}
                    >
                      <option value="Online Screening">Online Screening / Proposal</option>
                      <option value="Prototype Submission">Prototype Submission</option>
                      <option value="Coding Phase">Coding Phase / Hackathon</option>
                      <option value="Final Demo & Pitch">Final Demo & Pitch</option>
                      <option value="Other">Other Stage</option>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <Input
                      type="text"
                      aria-label={`Round ${idx + 1} name`}
                      placeholder={`Round name (e.g. ${idx === 0 ? "Ideation & Proposal" : idx === 1 ? "Prototype Building" : "Grand Finale Pitch"})`}
                      value={rd.name}
                      onChange={(e) => updateRoundField(idx, "name", e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        aria-label={`Round ${idx + 1} start date`}
                        value={rd.startDate}
                        onChange={(e) => updateRoundField(idx, "startDate", e.target.value)}
                      />
                      <Input
                        type="date"
                        aria-label={`Round ${idx + 1} end date`}
                        value={rd.endDate}
                        onChange={(e) => updateRoundField(idx, "endDate", e.target.value)}
                      />
                    </div>
                  </div>

                  <Textarea
                    aria-label={`Round ${idx + 1} description`}
                    placeholder="Short description or instructions for this round"
                    value={rd.description}
                    onChange={(e) => updateRoundField(idx, "description", e.target.value)}
                    className="min-h-[64px]"
                  />
                </li>
              ))}
            </ol>
          </FormSection>

          {/* Schedule & venue */}
          <FormSection title="Schedule & venue">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="hk-start">Start date</FieldLabel>
                <Input id="hk-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="hk-end">End date</FieldLabel>
                <Input id="hk-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="hk-mode">Participation mode</FieldLabel>
                <Select id="hk-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="online">Online</option>
                  <option value="in-person">In-person</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="hk-venue">{mode === "online" ? "Virtual venue" : "Physical venue"}</FieldLabel>
                <Input
                  id="hk-venue"
                  type="text"
                  placeholder={mode === "online" ? "Discord / Zoom" : "e.g. College Campus, Mumbai"}
                  value={mode === "online" ? "Virtual / Online" : location}
                  disabled={mode === "online"}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
          </FormSection>

          {/* Prizes & links */}
          <FormSection title="Prizes & links">
            <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
              <div>
                <FieldLabel htmlFor="hk-currency">Currency</FieldLabel>
                <Select id="hk-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </Select>
              </div>
              <div className="min-w-0">
                <FieldLabel htmlFor="hk-prize">Prize pool</FieldLabel>
                <Input
                  id="hk-prize"
                  type="text"
                  placeholder="e.g. 1,00,000 or Perks"
                  value={prizePool}
                  onChange={(e) => setPrizePool(e.target.value)}
                />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="hk-url" hint={type === "external" ? "Required" : "Optional"}>
                {type === "external" ? "Registration link" : "Official website"}
              </FieldLabel>
              <Input
                id="hk-url"
                type="url"
                placeholder="https://..."
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                required={type === "external"}
              />
            </div>
          </FormSection>

          {/* Audience */}
          <FormSection title="Audience">
            <div>
              <FieldLabel htmlFor="hk-college" hint="Optional">
                College / university
              </FieldLabel>
              <div className="relative">
                <Input
                  id="hk-college"
                  type="text"
                  role="combobox"
                  aria-expanded={showCollegeDropdown}
                  aria-controls="hk-college-list"
                  autoComplete="off"
                  placeholder="Search or select college"
                  value={showCollegeDropdown ? collegeSearch : college || ""}
                  onFocus={() => {
                    setCollegeSearch("");
                    setShowCollegeDropdown(true);
                  }}
                  onChange={(e) => {
                    setCollegeSearch(e.target.value);
                    setShowCollegeDropdown(true);
                  }}
                />

                {showCollegeDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowCollegeDropdown(false)} aria-hidden />
                    <div
                      id="hk-college-list"
                      role="listbox"
                      className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-line bg-overlay p-1 shadow-lg"
                    >
                      {filteredColleges.map((collegeName) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={college === collegeName}
                          key={collegeName}
                          onClick={() => {
                            setCollege(collegeName);
                            setCollegeSearch("");
                            setShowCollegeDropdown(false);
                          }}
                          className="block w-full rounded-[5px] px-3 py-2 text-left text-[13px] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                        >
                          {collegeName}
                        </button>
                      ))}
                      {filteredColleges.length === 0 && (
                        <p className="py-4 text-center text-[12.5px] text-ink-3">No colleges match your search.</p>
                      )}
                      <button
                        type="button"
                        role="option"
                        aria-selected={college === "Other"}
                        onClick={() => {
                          setCollege("Other");
                          setCollegeSearch("");
                          setShowCollegeDropdown(false);
                        }}
                        className="mt-1 block w-full rounded-[5px] border-t border-line px-3 py-2 text-left text-[13px] font-medium text-ink transition-colors hover:bg-hover"
                      >
                        Other (type a custom college name)
                      </button>
                    </div>
                  </>
                )}
              </div>

              {college === "Other" && (
                <Input
                  type="text"
                  aria-label="Custom college name"
                  placeholder="Enter custom college name"
                  value={customCollege}
                  onChange={(e) => setCustomCollege(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>

            <div>
              <FieldLabel htmlFor="hk-tags" hint="Comma separated">
                Event tags
              </FieldLabel>
              <Input
                id="hk-tags"
                type="text"
                placeholder="e.g. AI, Web3, Mobile, Beginners, FinTech"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
          </FormSection>

          {/* Form actions */}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => router.back()} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              {loading ? "Publishing…" : type === "native" ? "Submit for review" : "Publish event"}
            </Button>
          </div>
        </form>
      </Page>
    </AuthGuard>
  );
}

/** Labelled form block: sections are separated by space and a header, not boxes. */
function FormSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line pb-2.5">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-ink-3">{description}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Large selectable option (hosting mode). */
function ChoiceCard({
  selected,
  onSelect,
  icon,
  title,
  tag,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  tag: string;
  body: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg p-4 text-left transition-colors",
        selected
          ? "bg-accent-soft ring-2 ring-inset ring-accent-ink"
          : "bg-raised ring-1 ring-inset ring-line hover:ring-line-strong",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-ink [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-2">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        {selected ? (
          <CheckCircle2 className="size-4 shrink-0 text-accent-ink" aria-hidden />
        ) : (
          <span className="size-4 shrink-0 rounded-full ring-1 ring-inset ring-line-strong" aria-hidden />
        )}
      </span>
      <span className="text-[12.5px] leading-relaxed text-ink-3">{body}</span>
      <span className="caps-label text-ink-3">{tag}</span>
    </button>
  );
}

/** Compact preset toggle (team size). */
function PresetButton({ selected, onSelect, label, sub }: { selected: boolean; onSelect: () => void; label: string; sub: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-[52px] flex-col items-center justify-center rounded-md px-2 py-2 text-center transition-colors",
        selected ? "bg-ink text-canvas" : "bg-raised text-ink-2 ring-1 ring-inset ring-line-strong hover:text-ink",
      )}
    >
      <span className="text-[13.5px] font-semibold">{label}</span>
      <span className={cn("text-[11.5px]", selected ? "text-canvas/70" : "text-ink-3")}>{sub}</span>
    </button>
  );
}

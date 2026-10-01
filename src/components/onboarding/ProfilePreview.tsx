import { Avatar, Chip } from "@/components/system";
import { cn } from "@/lib/utils";

const MAX_CHIPS = 10;

/**
 * Live preview of the builder card teams see in search, plus the required
 * checklist in the same square-indicator style as the login pipeline.
 */
export function ProfilePreview({
  name,
  avatarUrl,
  college,
  year,
  bio,
  skills,
}: {
  name: string | null;
  avatarUrl: string | null;
  college: string;
  year: string;
  bio: string;
  skills: string[];
}) {
  const checks = [
    { label: "College", done: Boolean(college) },
    { label: "Year", done: Boolean(year) },
    { label: "1+ skill", done: skills.length > 0 },
  ];
  const ready = checks.every((c) => c.done);
  const shown = skills.slice(0, MAX_CHIPS);
  const extra = skills.length - shown.length;

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-line-strong/80 bg-raised">
        <div className="flex h-11 items-center justify-between border-b border-line px-4">
          <span className="font-mono text-[12px] text-ink-2">your builder card</span>
          <span className={cn("font-mono text-[12px]", ready ? "text-accent-ink" : "text-ink-3")}>{ready ? "ready" : "draft"}</span>
        </div>

        <div className="p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={name || "You"} src={avatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-display text-[18px] font-semibold leading-tight tracking-[-0.02em] text-ink">{name || "You"}</p>
              <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
                {college || "Your college"} · {year}
              </p>
            </div>
          </div>

          <p className={cn("mt-3 text-[13.5px] leading-relaxed", bio.trim() ? "text-ink-2" : "text-ink-3")}>
            {bio.trim() || "Your tagline shows here."}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {shown.length === 0 ? (
              <span className="text-[12.5px] text-ink-3">Pick skills to show them here.</span>
            ) : (
              <>
                {shown.map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
                {extra > 0 && <Chip>+{extra}</Chip>}
              </>
            )}
          </div>
        </div>

        <ol className="divide-y divide-line border-t border-line" aria-label="Required to finish">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-3 px-4 py-2.5">
              <span
                aria-hidden
                className={
                  c.done
                    ? "inline-flex size-[18px] items-center justify-center rounded-[5px] bg-accent"
                    : "inline-flex size-[18px] rounded-[5px] ring-1 ring-inset ring-line-strong"
                }
              >
                {c.done && <span className="size-1.5 rounded-full bg-on-accent" />}
              </span>
              <span className={c.done ? "caps-label text-ink" : "caps-label text-ink-3"}>{c.label}</span>
              <span className="ml-auto font-mono text-[12.5px] text-ink-3">{c.done ? "done" : "needed"}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="mt-4 text-[13px] text-ink-3">You can edit all of this later from your profile.</p>
    </div>
  );
}


"use client";

import { useState, type ReactNode } from "react";
import { Braces, CheckCircle2, Copy, FileSpreadsheet, Mail, Printer, TriangleAlert } from "lucide-react";
import {
  SIHTeamExport,
  SIHTeamMemberExport,
  checkSIHCompliance,
  exportSIHTeamCSV,
  exportSIHTeamJSON,
  generateSPOCEmailSummary,
  openSIHPrintDossier,
} from "@/lib/sihExport";
import { useNotification } from "@/context/NotificationContext";
import { Button, Dialog, Segmented, Tape, Textarea } from "@/components/system";

type SIHExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  team: SIHTeamExport;
  members: SIHTeamMemberExport[];
};

function ExportTile({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-3 rounded-md border border-line bg-raised p-3.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-[5px] bg-selected text-ink-2 [&_svg]:size-4">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{body}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

export default function SIHExportModal({
  isOpen,
  onClose,
  team,
  members,
}: SIHExportModalProps) {
  const { showToast } = useNotification();
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [activeTab, setActiveTab] = useState<"export" | "preview" | "email">("export");

  if (!isOpen) return null;

  const compliance = checkSIHCompliance(team, members);
  const emailText = generateSPOCEmailSummary(team, members);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailText);
    setCopiedEmail(true);
    showToast("Copied SPOC nomination email brief to clipboard!", "success");
    setTimeout(() => setCopiedEmail(false), 3000);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      size="lg"
      title="Export SIH nomination"
      description={
        <>
          Records for <span className="font-medium text-ink">{team.name}</span> to send to your college SPOC (faculty coordinator).
        </>
      }
      footer={
        <>
          <span className="hidden flex-1 self-center caps-label text-ink-4 sm:block">SIH 2026 export</span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {/* Compliance summary */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-line bg-sunken px-3 py-2.5">
        {compliance.isCompliant ? (
          <Tape tone="ok" icon={<CheckCircle2 />}>
            SIH compliant
          </Tape>
        ) : (
          <Tape tone="warn" icon={<TriangleAlert />}>
            {compliance.issues.length} check{compliance.issues.length === 1 ? "" : "s"} pending
          </Tape>
        )}
        <span className="font-mono text-[12px] text-ink-3 tabular">
          <span className={compliance.hasSixMembers ? "text-ok" : "text-ink-2"}>{compliance.memberCount}/6 members</span>
          <span className="text-ink-4"> · </span>
          <span className={compliance.hasFemaleMember ? "text-ok" : "text-warn"}>{compliance.femaleCount} female</span>
        </span>
      </div>

      <Segmented<"export" | "preview" | "email">
        className="mt-4 w-full [&>button]:flex-1"
        label="Export view"
        size="sm"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: "export", label: "Exports" },
          { value: "preview", label: "Roster", count: members.length },
          { value: "email", label: "SPOC email" },
        ]}
      />

      <div className="mt-4">
        {/* TAB 1: 1-CLICK EXPORTS */}
        {activeTab === "export" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <ExportTile
                icon={<FileSpreadsheet />}
                title="SIH CSV sheet"
                body="Spreadsheet in the SIH SPOC portal upload format."
                action={
                  <Button variant="primary" className="w-full" icon={<FileSpreadsheet />} onClick={() => exportSIHTeamCSV(team, members)}>
                    Download CSV
                  </Button>
                }
              />
              <ExportTile
                icon={<Printer />}
                title="Printable dossier"
                body="Formatted nomination document to print or save as PDF."
                action={
                  <Button variant="secondary" className="w-full" icon={<Printer />} onClick={() => openSIHPrintDossier(team, members)}>
                    Print / open PDF
                  </Button>
                }
              />
              <ExportTile
                icon={<Mail />}
                title="SPOC email brief"
                body="Email draft with the team summary and member details."
                action={
                  <Button
                    variant="secondary"
                    className="w-full"
                    icon={copiedEmail ? <CheckCircle2 className="text-ok" /> : <Copy />}
                    onClick={handleCopyEmail}
                  >
                    {copiedEmail ? "Email copied" : "Copy email text"}
                  </Button>
                }
              />
              <ExportTile
                icon={<Braces />}
                title="JSON package"
                body="Structured record for portal APIs and institutional archives."
                action={
                  <Button variant="secondary" className="w-full" icon={<Braces />} onClick={() => exportSIHTeamJSON(team, members)}>
                    Download JSON
                  </Button>
                }
              />
            </div>

            {/* Compliance Guidance Notice */}
            {compliance.issues.length > 0 && (
              <div className="rounded-md bg-warn-soft px-3.5 py-3 ring-1 ring-inset ring-warn/30" role="note">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden />
                  Fix before submitting to your SPOC
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] text-ink-2">
                  {compliance.issues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ROSTER PREVIEW */}
        {activeTab === "preview" && (
          <div>
            <p className="mb-2 caps-label text-ink-3">
              Roster · <span className="tabular">{members.length}/6</span>
            </p>
            <ol className="divide-y divide-line rounded-md border border-line bg-raised">
              {members.map((m, idx) => {
                const isFemale =
                  m.profiles?.gender?.toLowerCase() === "female" || m.profiles?.gender?.toLowerCase() === "f";
                const isLeader = m.role === "owner" || m.profiles?.id === team.owner_id;
                return (
                  <li key={m.id || idx} className="flex items-start gap-3 px-3 py-2.5">
                    <span className="w-4 shrink-0 pt-0.5 font-mono text-[12px] text-ink-3 tabular">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-medium text-ink">
                          {m.profiles?.full_name || "Anonymous Member"}
                        </span>
                        {isLeader && <Tape tone="accent">Leader</Tape>}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[12px] text-ink-3">{m.profiles?.email || "N/A"}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-2">
                        {m.project_role || (m.role === "owner" ? "Team Leader" : "Developer")}
                      </p>
                    </div>
                    <Tape tone={isFemale ? "ok" : "neutral"} className="mt-0.5 shrink-0">
                      {m.profiles?.gender || "Unspecified"}
                    </Tape>
                  </li>
                );
              })}
              {Array.from({ length: Math.max(0, 6 - members.length) }).map((_, idx) => (
                <li key={`empty-${idx}`} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-4 shrink-0 font-mono text-[12px] text-ink-4 tabular">{members.length + idx + 1}</span>
                  <span className="text-[12.5px] text-ink-3">Open seat · add a teammate to reach 6</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* TAB 3: SPOC EMAIL COPY */}
        {activeTab === "email" && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="caps-label text-ink-3">Email draft for your faculty SPOC</span>
              <Button
                size="sm"
                variant={copiedEmail ? "secondary" : "primary"}
                icon={copiedEmail ? <CheckCircle2 className="text-ok" /> : <Copy />}
                onClick={handleCopyEmail}
                className="max-md:h-9"
              >
                {copiedEmail ? "Copied" : "Copy email text"}
              </Button>
            </div>
            <Textarea readOnly value={emailText} rows={12} aria-label="SPOC email draft" className="resize-none font-mono text-[12px]" />
          </div>
        )}
      </div>
    </Dialog>
  );
}

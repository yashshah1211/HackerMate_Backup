"use client";

import { useState } from "react";
import DevShell from "../../DevShell";
import { WorkspaceFrame, type WorkspaceTab } from "@/components/workspace/WorkspaceFrame";
import { Avatar } from "@/components/system";

const MEMBERS = [
  { id: "m1", profiles: { id: "u1", full_name: "Ananya Rao", avatar_url: null } },
  { id: "m2", profiles: { id: "u2", full_name: "Sara Qureshi", avatar_url: null } },
  { id: "m3", profiles: { id: "u3", full_name: "Kabir Menon", avatar_url: null } },
  { id: "m4", profiles: { id: "u4", full_name: "Meera Iyer", avatar_url: null } },
];

const MESSAGES = [
  { who: "Sara Qureshi", text: "Pushed the CV model to the repo. Inference is ~180ms on CPU.", t: "21:04" },
  { who: "Kabir Menon", text: "Nice. I'll wire it to the attendance API tonight.", t: "21:06" },
  { who: "Ananya Rao", text: "Deck review is at 10. Can someone own the demo video?", t: "21:11" },
];

/** Workspace shell preview with placeholder content (no data calls). */
export default function DevWorkspace() {
  const [tab, setTab] = useState<WorkspaceTab>("chat");
  return (
    <DevShell pathname="/teams/dev-team-1/workspace">
      <WorkspaceFrame
        team={{ id: "dev-team-1", name: "Null Pointers" }}
        tone="sih"
        isOwner
        canShare
        tab={tab}
        onTabChange={setTab}
        listedHackathons={[{ id: "h1", name: "Smart India Hackathon 2026" }]}
        activeHackathon={{ id: "h1", name: "Smart India Hackathon 2026" }}
        countdown={{ days: 12, hours: 7, minutes: 41, seconds: 9, ended: false }}
        tasks={{ done: 7, total: 12, pct: 58 }}
        coverage={{ desired: ["React", "Python", "Figma", "PostgreSQL"], covered: ["React", "Python"], missing: ["Figma", "PostgreSQL"] }}
        onlineTeammates={[
          { id: "u2", name: "Sara Qureshi", avatarUrl: null },
          { id: "u3", name: "Kabir Menon", avatarUrl: null },
        ]}
        members={MEMBERS}
        onShare={() => {}}
        onFindBuilders={() => {}}
      >
        <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-lg border border-line md:h-[calc(100dvh-9rem)] lg:h-[calc(100dvh-6.5rem)]">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {MESSAGES.map((m, i) => (
              <div key={i} className="flex gap-3">
                <Avatar name={m.who} size="sm" />
                <div>
                  <p className="text-[12.5px]">
                    <span className="font-semibold text-ink">{m.who}</span> <span className="font-mono text-[11px] text-ink-4">{m.t}</span>
                  </p>
                  <p className="text-[13.5px] text-ink-2">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-line p-3">
            <div className="h-10 rounded-md bg-sunken px-3 text-[13px] leading-10 text-ink-4 ring-1 ring-inset ring-line-strong">Message #null-pointers</div>
          </div>
        </div>
      </WorkspaceFrame>
    </DevShell>
  );
}

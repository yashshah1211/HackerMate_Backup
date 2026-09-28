"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  Handshake,
  Inbox,
  Lightbulb,
  LogOut,
  Moon,
  PenLine,
  Settings,
  Shield,
  Sun,
  Swords,
  Trophy,
  UserRound,
} from "lucide-react";
import { Avatar, Menu, Sheet, type MenuItem } from "@/components/system";
import { cn } from "@/lib/utils";
import type { ShellProfile } from "./useShellSession";

type AccountActions = {
  profile: ShellProfile | null;
  viewerId: string;
  theme: "dark" | "light";
  toggleTheme: () => void;
  onRequestSignOut: () => void;
};

function useAccountItems({ viewerId, profile, theme, toggleTheme, onRequestSignOut }: AccountActions, includePractice: boolean): MenuItem[] {
  const router = useRouter();
  const go = (href: string) => () => router.push(href);
  const items: MenuItem[] = [
    { label: "Your profile", icon: <UserRound />, onSelect: go(`/profile/${viewerId}`) },
    { label: "Edit profile", icon: <PenLine />, onSelect: go("/profile/edit") },
    { label: "Connections", icon: <Handshake />, onSelect: go("/connections") },
    { label: "Team invites", icon: <Inbox />, onSelect: go("/invites") },
    { label: "Saved hackathons", icon: <Bookmark />, onSelect: go("/hackathons?tab=saved") },
  ];
  if (includePractice) {
    items.push(
      { type: "label", label: "Practice" },
      { label: "Challenges", icon: <Swords />, onSelect: go("/challenges") },
      { label: "Leaderboard", icon: <Trophy />, onSelect: go("/leaderboard") },
      { label: "Idea evaluator", icon: <Lightbulb />, onSelect: go("/evaluator") },
    );
  }
  items.push(
    { type: "separator" },
    { label: "Settings", icon: <Settings />, onSelect: go("/settings") },
    {
      label: theme === "dark" ? "Light mode" : "Dark mode",
      icon: theme === "dark" ? <Sun /> : <Moon />,
      onSelect: toggleTheme,
    },
  );
  if (profile?.role === "admin") {
    items.push({ label: "Admin panel", icon: <Shield />, onSelect: go("/admin") });
  }
  items.push({ type: "separator" }, { label: "Sign out", icon: <LogOut />, tone: "danger", onSelect: onRequestSignOut });
  return items;
}

function AccountHeader({ profile, viewerId }: { profile: ShellProfile | null; viewerId: string }) {
  return (
    <Link
      href={`/profile/${viewerId}`}
      className="mb-1 flex items-center gap-2.5 rounded-md border-b border-line px-2.5 pb-2.5 pt-2 hover:bg-hover"
    >
      <Avatar name={profile?.full_name} src={profile?.avatar_url} size="md" />
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold text-ink">{profile?.full_name || "Your account"}</span>
        <span className="block text-[12px] text-ink-3">View profile</span>
      </span>
    </Link>
  );
}

/** Desktop: avatar at the foot of the rail opens this menu to the right. */
export function AccountMenu(props: AccountActions) {
  const items = useAccountItems(props, false);
  return (
    <Menu
      side="right"
      align="end"
      items={items}
      header={<AccountHeader profile={props.profile} viewerId={props.viewerId} />}
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          className={cn("rounded-full p-0.5 transition-shadow", open ? "ring-2 ring-signal" : "hover:ring-2 hover:ring-line-strong")}
        >
          <Avatar name={props.profile?.full_name} src={props.profile?.avatar_url} size="md" />
        </button>
      )}
    />
  );
}

/** Mobile: the avatar in the top bar opens this bottom sheet (includes Practice). */
export function AccountSheet({ open, onClose, ...props }: AccountActions & { open: boolean; onClose: () => void }) {
  const items = useAccountItems(props, true);
  return (
    <Sheet open={open} onClose={onClose} label="Account">
      <div className="px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <AccountHeader profile={props.profile} viewerId={props.viewerId} />
        {items.map((item, i) => {
          if (item.type === "separator") return <div key={i} className="mx-2 my-1.5 h-px bg-line" />;
          if (item.type === "label")
            return (
              <div key={i} className="px-3 pb-1 pt-3 caps-label text-ink-4">
                {item.label}
              </div>
            );
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                onClose();
                item.onSelect();
              }}
              className={cn(
                "flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-[15px] [&_svg]:size-[18px]",
                item.tone === "danger" ? "text-bad active:bg-bad-soft" : "text-ink active:bg-hover",
              )}
            >
              <span className={item.tone === "danger" ? "text-bad" : "text-ink-3"}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

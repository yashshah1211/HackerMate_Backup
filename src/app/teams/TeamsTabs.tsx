"use client";

import { usePathname } from "next/navigation";
import { RouteTabs } from "@/components/system";

/** Section tabs shared by /teams, /my-teams and /invites. */
export function TeamsTabs({ invites }: { invites?: number }) {
  const pathname = usePathname() || "";
  return (
    <RouteTabs
      tabs={[
        { href: "/teams", label: "Discover", active: pathname === "/teams" },
        { href: "/my-teams", label: "Your teams", active: pathname.startsWith("/my-teams") },
        { href: "/invites", label: "Invites", count: invites, active: pathname.startsWith("/invites") },
      ]}
    />
  );
}

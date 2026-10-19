"use client";

import AuthGuard from "@/components/AuthGuard";
import { MyTeamsView } from "./MyTeamsView";
import { useMyTeamsData } from "./useMyTeamsData";

function MyTeamsContent() {
  const teams = useMyTeamsData();
  return <MyTeamsView data={teams.data} handlers={teams} />;
}

export default function MyTeamsPage() {
  return <AuthGuard><MyTeamsContent /></AuthGuard>;
}

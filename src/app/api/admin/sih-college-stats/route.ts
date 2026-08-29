import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";

import { SIH_HACKATHON_ID } from "@/lib/constants";

function isSameCollege(collegeA: string | null | undefined, collegeB: string | null | undefined): boolean {
  if (!collegeA || !collegeB) return false;
  const a = collegeA.toLowerCase().trim();
  const b = collegeB.toLowerCase().trim();
  if (a === b) return true;

  // Handle DJSCE / Dwarkadas J. Sanghvi synonyms
  const isDJSCEA = a.includes("djsce") || a.includes("dwarkadas");
  const isDJSCEB = b.includes("djsce") || b.includes("dwarkadas");
  if (isDJSCEA && isDJSCEB) return true;

  const getFirstWord = (s: string) => s.split(/[\s,()]+/)[0];
  const w1 = getFirstWord(a);
  const w2 = getFirstWord(b);

  const acronyms = ["djsce", "spit", "vjti", "tsec", "vesit", "coep", "pict", "vit", "mit", "vnit", "iit", "nit", "iiit"];
  if (acronyms.includes(w1) && w1 === w2) return true;

  return a.includes(b) || b.includes(a);
}

export type CollegeStat = {
  collegeName: string;
  builderCount: number;
  lookingForTeamCount: number;
  teamCount: number;
  totalTeamMembers: number;
  avgTeamSize: string;
  isHighPotentialZeroTeams: boolean;
  builders: any[];
  teams: any[];
};

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    // 1. Fetch all registrations for SIH 2026 joined with profiles
    const { data: registrations, error: regErr } = await supabaseAdmin
      .from("hackathon_registrations")
      .select(`
        id,
        user_id,
        looking_for_team,
        status,
        created_at,
        profiles (
          id,
          full_name,
          email,
          college,
          avatar_url,
          skills
        )
      `)
      .eq("hackathon_id", SIH_HACKATHON_ID);

    if (regErr) {
      return NextResponse.json({ error: regErr.message }, { status: 500 });
    }

    // 2. Fetch all teams registered for SIH 2026
    const { data: teamHackathons, error: thErr } = await supabaseAdmin
      .from("team_hackathons")
      .select(`
        team_id,
        created_at,
        teams (
          id,
          name,
          description,
          college,
          owner_id,
          max_members,
          team_members (
            id,
            user_id,
            profiles (
              id,
              full_name,
              email,
              college
            )
          )
        )
      `)
      .eq("hackathon_id", SIH_HACKATHON_ID);

    if (thErr) {
      return NextResponse.json({ error: thErr.message }, { status: 500 });
    }

    const rawTeams = (teamHackathons || []).map((th: any) => th.teams).filter(Boolean);

    // Grouping by College
    const collegeMap: Record<string, {
      canonicalName: string;
      builders: any[];
      teams: any[];
    }> = {};

    function getOrCreateCollegeGroup(rawCollegeName: string | null | undefined): string {
      if (!rawCollegeName || !rawCollegeName.trim()) return "Unspecified / Independent";
      const trimmed = rawCollegeName.trim();

      // Check if existing group matches via isSameCollege
      const existingKeys = Object.keys(collegeMap);
      for (const key of existingKeys) {
        if (isSameCollege(key, trimmed)) {
          return key;
        }
      }

      // Create new group
      collegeMap[trimmed] = {
        canonicalName: trimmed,
        builders: [],
        teams: [],
      };
      return trimmed;
    }

    // Group Builders
    (registrations || []).forEach((reg: any) => {
      const p = reg.profiles;
      if (p) {
        const key = getOrCreateCollegeGroup(p.college);
        collegeMap[key].builders.push({
          ...p,
          looking_for_team: reg.looking_for_team,
          registered_at: reg.created_at,
        });
      }
    });

    // Group Teams
    rawTeams.forEach((t: any) => {
      // Determine team college from team.college or owner's profile college
      let teamCollege = t.college;
      if (!teamCollege && t.team_members && t.team_members.length > 0) {
        const ownerMember = t.team_members.find((m: any) => m.user_id === t.owner_id) || t.team_members[0];
        teamCollege = ownerMember?.profiles?.college;
      }

      const key = getOrCreateCollegeGroup(teamCollege);
      collegeMap[key].teams.push(t);
    });

    // Format & Compute Statistics per College
    const collegeStats: CollegeStat[] = Object.values(collegeMap).map((group) => {
      const builderCount = group.builders.length;
      const lookingForTeamCount = group.builders.filter((b) => b.looking_for_team).length;
      const teamCount = group.teams.length;
      
      let totalTeamMembers = 0;
      group.teams.forEach((t) => {
        totalTeamMembers += (t.team_members || []).length;
      });

      const avgTeamSize = teamCount > 0 ? (totalTeamMembers / teamCount).toFixed(1) : "0";
      const isHighPotentialZeroTeams = builderCount >= 2 && teamCount === 0;

      return {
        collegeName: group.canonicalName,
        builderCount,
        lookingForTeamCount,
        teamCount,
        totalTeamMembers,
        avgTeamSize,
        isHighPotentialZeroTeams,
        builders: group.builders,
        teams: group.teams,
      };
    });

    // Sort by Builder Count Descending, then Team Count Descending
    collegeStats.sort((a, b) => {
      if (b.builderCount !== a.builderCount) {
        return b.builderCount - a.builderCount;
      }
      return b.teamCount - a.teamCount;
    });

    // Overall Summary Stats
    const totalBuilders = registrations?.length || 0;
    const totalLookingForTeam = (registrations || []).filter((r: any) => r.looking_for_team).length;
    const totalTeams = rawTeams.length;
    const totalColleges = collegeStats.length;
    const highPotentialZeroTeamColleges = collegeStats.filter((c) => c.isHighPotentialZeroTeams).length;

    return NextResponse.json({
      success: true,
      summary: {
        totalBuilders,
        totalLookingForTeam,
        totalTeams,
        totalColleges,
        highPotentialZeroTeamColleges,
      },
      collegeStats,
    });
  } catch (err: any) {
    console.error("[SIH College Stats API Error]:", err);
    return NextResponse.json({ error: err.message || "Failed to load SIH college stats." }, { status: 500 });
  }
}

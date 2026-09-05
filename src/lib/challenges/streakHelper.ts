/**
 * Calculates user practice streak and XP from completed challenge submissions
 */

export interface UserPracticeStreak {
  currentStreak: number; // consecutive weeks
  longestStreak: number;
  totalSolved: number;
  totalXp: number;
  tier: "Novice" | "Architect" | "Grandmaster" | "Legend";
}

export function calculatePracticeStreak(submissionDates: string[]): UserPracticeStreak {
  if (!submissionDates || submissionDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalSolved: 0,
      totalXp: 0,
      tier: "Novice",
    };
  }

  // Sort timestamps descending
  const sortedDates = submissionDates
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  if (sortedDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalSolved: 0,
      totalXp: 0,
      tier: "Novice",
    };
  }

  // Group by week (ISO Year-Week)
  const getYearWeek = (d: Date) => {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    return `${target.getFullYear()}-W${weekNumber}`;
  };

  const weekSet = new Set<string>();
  sortedDates.forEach((d) => weekSet.add(getYearWeek(d)));

  // Calculate current streak
  const now = new Date();
  const currentWeek = getYearWeek(now);
  const lastWeek = getYearWeek(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

  let streak = 0;
  let hasActivityThisOrLastWeek = weekSet.has(currentWeek) || weekSet.has(lastWeek);

  if (hasActivityThisOrLastWeek) {
    // Walk back week by week
    let checkDate = weekSet.has(currentWeek) ? now : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    while (weekSet.has(getYearWeek(checkDate))) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }

  const totalSolved = sortedDates.length;
  // 150 XP per solved challenge + streak bonus
  const totalXp = totalSolved * 150 + streak * 50;

  let tier: "Novice" | "Architect" | "Grandmaster" | "Legend" = "Novice";
  if (totalXp >= 1500) tier = "Legend";
  else if (totalXp >= 750) tier = "Grandmaster";
  else if (totalXp >= 300) tier = "Architect";

  return {
    currentStreak: streak || (totalSolved > 0 ? 1 : 0),
    longestStreak: Math.max(streak, totalSolved > 0 ? 1 : 0),
    totalSolved,
    totalXp,
    tier,
  };
}

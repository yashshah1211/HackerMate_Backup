export type ProfileCompletenessResult = {
  score: number; // 0 - 100
  missingBio: boolean;
  missingSkills: boolean;
  missingCollege: boolean;
  missingGithub: boolean;
  missingName: boolean;
  missingFields: Array<{
    key: "bio" | "skills" | "college" | "github_url" | "full_name";
    label: string;
  }>;
};

export function calculateProfileCompleteness(profile: any): ProfileCompletenessResult {
  if (!profile) {
    return {
      score: 0,
      missingBio: true,
      missingSkills: true,
      missingCollege: true,
      missingGithub: true,
      missingName: true,
      missingFields: [],
    };
  }

  const missingBio = !profile.bio || !profile.bio.trim();
  const missingSkills = !profile.skills || !Array.isArray(profile.skills) || profile.skills.length === 0;
  const missingCollege = !profile.college || !profile.college.trim();
  const missingGithub = !profile.github_url || !profile.github_url.trim();
  const missingName = !profile.full_name || !profile.full_name.trim();

  let score = 0;
  if (!missingName) score += 20;
  if (!missingCollege) score += 20;
  if (!missingBio) score += 20;
  if (!missingGithub) score += 20;
  if (!missingSkills) score += 20;

  const missingFields: ProfileCompletenessResult["missingFields"] = [];
  if (missingBio) missingFields.push({ key: "bio", label: "Bio / About You" });
  if (missingSkills) missingFields.push({ key: "skills", label: "Skills" });
  if (missingCollege) missingFields.push({ key: "college", label: "College / University" });
  if (missingGithub) missingFields.push({ key: "github_url", label: "GitHub Profile" });
  if (missingName) missingFields.push({ key: "full_name", label: "Full Name" });

  return {
    score,
    missingBio,
    missingSkills,
    missingCollege,
    missingGithub,
    missingName,
    missingFields,
  };
}

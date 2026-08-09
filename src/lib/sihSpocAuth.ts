import { createClient } from "@supabase/supabase-js";

export type SpocAuthResult = {
  isAuthorized: boolean;
  role: string;
  collegeName: string | null;
  isAdminOverride: boolean;
};

export function isSameCollege(collegeA: string | null | undefined, collegeB: string | null | undefined): boolean {
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

export async function verifySpocAuthorization(user: any, supabaseAdmin: any): Promise<SpocAuthResult> {
  if (!user || !user.email) {
    return { isAuthorized: false, role: "none", collegeName: null, isAdminOverride: false };
  }

  const email = user.email.toLowerCase().trim();

  // 1. Platform Super Admin Check
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin, role, college")
      .eq("id", user.id)
      .maybeSingle();

    if (
      profile?.is_admin ||
      profile?.role === "admin" ||
      email === "yashshah7117@gmail.com" ||
      email === "yashshah111@gmail.com"
    ) {
      return {
        isAuthorized: true,
        role: "admin",
        collegeName: profile?.college || "D.J. Sanghvi College of Engineering (DJSCE)",
        isAdminOverride: true,
      };
    }
  } catch (err) {
    console.error("[SPOC Auth Profile Check Error]:", err);
  }

  // 2. Strict Database Allowlist Lookup (sih_spoc_allowlist table)
  try {
    const { data: allowlistEntry } = await supabaseAdmin
      .from("sih_spoc_allowlist")
      .select("email, college_name, role, is_active")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle();

    if (allowlistEntry) {
      return {
        isAuthorized: true,
        role: allowlistEntry.role || "spoc",
        collegeName: allowlistEntry.college_name,
        isAdminOverride: false,
      };
    }
  } catch (err) {
    console.error("[SPOC Allowlist Table Check Error]:", err);
  }

  return { isAuthorized: false, role: "none", collegeName: null, isAdminOverride: false };
}

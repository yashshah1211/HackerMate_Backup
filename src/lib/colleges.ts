// Two separate GL Bajaj institutions. They must never be merged.
export const GL_BAJAJ_MATHURA = "GL Bajaj Group of Institutions, Mathura";
export const GL_BAJAJ_GREATER_NOIDA = "GL Bajaj Institute of Technology & Management, Greater Noida";

export const COLLEGES = [
  // Maharashtra - Mumbai
  "VJTI Mumbai (Veermata Jijabai Technological Institute)",
  "SPIT Mumbai (Sardar Patel Institute of Technology)",
  "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)",
  "TSEC Mumbai (Thadomal Shahani Engineering College)",
  "VESIT Mumbai (Vivekanand Education Society's Institute of Technology)",
  "K. J. Somaiya College of Engineering, Mumbai",
  "ICT Mumbai (Institute of Chemical Technology)",
  "Fr. Conceicao Rodrigues College of Engineering, Mumbai",
  "NMIMS MPSTME, Mumbai",
  "Sardar Patel College of Engineering, Mumbai (SPCE)",
  "TCET Mumbai (Thakur College of Engineering and Technology)",
  "KJSIT Mumbai (K. J. Somaiya Institute of Technology)",
  "RAIT Navi Mumbai",
  
  // Maharashtra - Pune
  "COEP Technological University, Pune",
  "PICT Pune (Pune Institute of Computer Technology)",
  "VIT Pune (Vishwakarma Institute of Technology)",
  "MIT WPU Pune (MIT World Peace University)",
  "Army Institute of Technology, Pune",
  "D. Y. Patil College of Engineering, Pune",
  "Cummins College of Engineering for Women, Pune",
  
  // Maharashtra - Other
  "Walchand College of Engineering, Sangli",
  "SGGSIE&T Nanded",
  "Government College of Engineering, Karad",
  "Government College of Engineering, Aurangabad",
  "RCOEM Nagpur (Ramdeobaba College of Engineering)",
  "VNIT Nagpur",
  
  // IITs (Indian Institutes of Technology)
  "IIT Bombay",
  "IIT Delhi",
  "IIT Madras",
  "IIT Kharagpur",
  "IIT Kanpur",
  "IIT Roorkee",
  "IIT Guwahati",
  "IIT Hyderabad",
  "IIT BHU (Varanasi)",
  "IIT Indore",
  "IIT Ropar",
  "IIT Mandi",
  "IIT Gandhinagar",
  "IIT Patna",
  "IIT Bhubaneswar",
  "IIT Tirupati",
  "IIT Palakkad",
  "IIT Jodhpur",
  "IIT Bhilai",
  "IIT Goa",
  "IIT Jammu",
  "IIT Dharwad",
  
  // BITS
  "BITS Pilani",
  "BITS Pilani (Goa Campus)",
  "BITS Pilani (Hyderabad Campus)",
  
  // NITs
  "NIT Trichy",
  "NIT Surathkal",
  "NIT Warangal",
  "NIT Rourkela",
  "NIT Calicut",
  "MNIT Jaipur",
  "MNNIT Allahabad",
  "NIT Kurukshetra",
  "NIT Durgapur",
  "NIT Silchar",
  "NIT Delhi",
  "NIT Jalandhar",
  "NIT Hamirpur",
  "NIT Raipur",
  "NIT Patna",
  "NIT Goa",
  "NIT Jamshedpur",
  "SVNIT Surat",
  
  // IIITs
  "IIIT Hyderabad",
  "IIIT Bangalore",
  "IIIT Allahabad",
  "IIIT Delhi",
  "IIITM Gwalior",
  "IIITDM Kancheepuram",
  "IIIT Pune",
  "IIIT Kota",
  "IIIT Sri City",
  "IIIT Vadodara",
  "IIIT Lucknow",
  
  // Other Top National Universities
  "IISc Bangalore",
  "DTU Delhi",
  "NSUT Delhi",
  "PEC Chandigarh",
  "DAIICT Gandhinagar",
  "Nirma University, Ahmedabad",
  "PDEU Gandhinagar",
  "VIT Vellore",
  "SRM Institute of Science and Technology",
  "Manipal Institute of Technology",
  "RVCE Bangalore",
  "PES University, Bangalore",
  "BMS College of Engineering, Bangalore",
  "Thapar Institute of Engineering and Technology, Patiala",
  "PSG College of Technology, Coimbatore",
  "Amrita Vishwa Vidyapeetham",

  // Uttar Pradesh
  GL_BAJAJ_MATHURA,
  GL_BAJAJ_GREATER_NOIDA,
  
  // Fallback
  "Other"
];

export const COLLEGE_EXACT_ALIASES: Record<string, string> = {
  // TCET
  "tcet": "TCET Mumbai (Thakur College of Engineering and Technology)",
  "thakur college of engineering and technology": "TCET Mumbai (Thakur College of Engineering and Technology)",
  "thakur college of engineering & technology": "TCET Mumbai (Thakur College of Engineering and Technology)",
  "thakur college of engineering": "TCET Mumbai (Thakur College of Engineering and Technology)",
  
  // DJSCE
  "djsce": "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)",
  "dwarkadas j sanghvi college of engineering": "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)",
  "dwarkadas j. sanghvi college of engineering": "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)",
  "dwarkadas j.  sanghvi college of engineering": "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)",
  "dwarkadas sanghvi": "DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)",

  // VJTI
  "vjti": "VJTI Mumbai (Veermata Jijabai Technological Institute)",
  "veermata jijabai technological institute": "VJTI Mumbai (Veermata Jijabai Technological Institute)",

  // SPIT
  "spit": "SPIT Mumbai (Sardar Patel Institute of Technology)",
  "sardar patel institute of technology": "SPIT Mumbai (Sardar Patel Institute of Technology)",

  // TSEC
  "tsec": "TSEC Mumbai (Thadomal Shahani Engineering College)",
  "thadomal shahani engineering college": "TSEC Mumbai (Thadomal Shahani Engineering College)",

  // VESIT
  "vesit": "VESIT Mumbai (Vivekanand Education Society's Institute of Technology)",
  "vivekanand education society's institute of technology": "VESIT Mumbai (Vivekanand Education Society's Institute of Technology)",

  // KJSIT
  "kjsit": "KJSIT Mumbai (K. J. Somaiya Institute of Technology)",
  "k j somaiya institute of technology": "KJSIT Mumbai (K. J. Somaiya Institute of Technology)",
  "kj somaiya institute of technology": "KJSIT Mumbai (K. J. Somaiya Institute of Technology)",

  // COEP
  "coep": "COEP Technological University, Pune",
  "college of engineering pune": "COEP Technological University, Pune",

  // PICT
  "pict": "PICT Pune (Pune Institute of Computer Technology)",
  "pune institute of computer technology": "PICT Pune (Pune Institute of Computer Technology)",

  // VIT Pune
  "vit pune": "VIT Pune (Vishwakarma Institute of Technology)",
  "vishwakarma institute of technology": "VIT Pune (Vishwakarma Institute of Technology)",

  // IITs
  "iitb": "IIT Bombay",
  "iit bombay": "IIT Bombay",
  "iitd": "IIT Delhi",
  "iit delhi": "IIT Delhi",
  "iitm": "IIT Madras",
  "iit madras": "IIT Madras",

  // DTU
  "dtu": "DTU Delhi",
  "delhi technological university": "DTU Delhi",
};

/**
 * Normalizes a given college input string.
 * EXPLICIT RULE: Collapses all multiple consecutive whitespace characters (\s+)
 * into a single space and trims leading/trailing whitespace before performing
 * an EXACT-MATCH ONLY (case-insensitive) check against the canonical list and alias dictionary.
 * Reviewed campus-explicit GL Bajaj aliases are then matched by exact
 * punctuation-insensitive key (no substring or fuzzy matching).
 * 
 * If no exact match is found, the cleaned/collapsed custom input is preserved untouched.
 */
export function normalizeCollege(input?: string | null): string {
  if (!input) return "";
  // Explicit Rule: Collapse multiple spaces & trim
  const collapsed = input.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";

  // 1. Direct match against canonical list (case-insensitive)
  const canonicalMatch = COLLEGES.find(
    (c) => c.toLowerCase() === collapsed.toLowerCase()
  );
  if (canonicalMatch) return canonicalMatch;

  // 2. Exact match lookup in alias dictionary
  const lowerKey = collapsed.toLowerCase();
  if (COLLEGE_EXACT_ALIASES[lowerKey]) {
    return COLLEGE_EXACT_ALIASES[lowerKey];
  }

  // 3. Reviewed campus-explicit aliases, compared by punctuation-insensitive key.
  // Only reached when steps 1 and 2 miss, so earlier mappings are unchanged.
  const campusMatch = CAMPUS_ALIAS_KEYS.get(collegeMatchKey(collapsed));
  if (campusMatch) return campusMatch;

  // 4. Fallback: Return collapsed input as-is for unlisted custom colleges
  return collapsed;
}

/**
 * Comparison key that ignores case, punctuation and extra whitespace.
 * "&" becomes "and", and runs of single letters are joined so "G.L." and "GL"
 * produce the same key. Used only for exact key lookups and dropdown search.
 */
export function collegeMatchKey(input?: string | null): string {
  if (!input) return "";
  const tokens = input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const merged: string[] = [];
  let initials = "";
  for (const token of tokens) {
    if (/^[a-z]$/.test(token)) {
      initials += token;
      continue;
    }
    if (initials) merged.push(initials);
    initials = "";
    merged.push(token);
  }
  if (initials) merged.push(initials);
  return merged.join(" ");
}

/**
 * Reviewed, campus-explicit GL Bajaj alias keys (see collegeMatchKey).
 * City-less names such as "GL Bajaj", "GL Bajaj Group of Institutions" or
 * "GL Bajaj Institute of Technology and Management" are intentionally absent
 * and stay unchanged.
 */
const CAMPUS_ALIAS_KEYS = new Map<string, string>([
  ["gl bajaj group of institutions mathura", GL_BAJAJ_MATHURA],
  ["gl bajaj group of institution mathura", GL_BAJAJ_MATHURA],
  ["gl bajaj mathura", GL_BAJAJ_MATHURA],
  ["gl bajaj institute of technology and management greater noida", GL_BAJAJ_GREATER_NOIDA],
]);

/**
 * Exact spellings already stored on profiles before the canonical names existed,
 * as reviewed in the read-only production audit. Used only to keep same-campus
 * dashboard results working until the Phase B data backfill. Do not add
 * unreviewed variants here.
 */
const CAMPUS_REVIEWED_SPELLINGS = new Map<string, readonly string[]>([
  [GL_BAJAJ_MATHURA, [
    "GL Bajaj Group Of Institutions Mathura",
    "GL Bajaj Group Of Institutions, Mathura",
    "G.L. Bajaj Group Of Institutions, Mathura",
    "G.L.bajaj group of institutions mathura",
    "GL Bajaj group of institution mathura",
    "G.l bajaj mathura",
    "Gl bajaj mathura",
  ]],
  [GL_BAJAJ_GREATER_NOIDA, []],
]);

/**
 * Stored `college` values that count as the same campus for exact-match queries.
 * Colleges outside the reviewed campus set return only their normalized value,
 * exactly as before. For a reviewed campus, the list also includes the reviewed
 * legacy spellings and the user's own stored spelling, so no existing peer
 * disappears before the backfill.
 */
export function collegeMatchValues(input?: string | null): string[] {
  const normalized = normalizeCollege(input);
  if (!normalized) return [];
  const reviewed = CAMPUS_REVIEWED_SPELLINGS.get(normalized);
  if (!reviewed) return [normalized];
  const values = [normalized, ...reviewed];
  // Same collapsed value the previous exact-match query used.
  const own = (input ?? "").replace(/\s+/g, " ").trim();
  // PostgREST list quoting cannot escape these characters, so skip such values.
  if (own && !/["\\]/.test(own)) values.push(own);
  return Array.from(new Set(values));
}

/**
 * Dropdown search match. Keeps every match of the previous case-insensitive
 * substring search, then also tolerates punctuation, spacing and word order gaps
 * (e.g. "g.l bajaj mathura" finds the Mathura entry but not Greater Noida).
 */
export function collegeMatchesSearch(college: string, query: string): boolean {
  if (college.toLowerCase().includes(query.toLowerCase())) return true;
  const queryKey = collegeMatchKey(query);
  if (!queryKey) return false;
  const collegeKey = collegeMatchKey(college);
  if (collegeKey.replace(/ /g, "").includes(queryKey.replace(/ /g, ""))) return true;
  const words = collegeKey.split(" ");
  return queryKey.split(" ").every((part) => words.some((word) => word.startsWith(part)));
}



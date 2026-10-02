export type Capability =
  | "Frontend"
  | "Backend"
  | "AI/ML"
  | "Data"
  | "UI/UX"
  | "Product"
  | "Growth"
  | "Cloud/DevOps"
  | "Mobile"
  | "Security"
  | "IoT";

export type Builder = {
  id: string;
  name: string;
  role: string;
  skills: string[];
  covers: Capability[];
  needsSupportWith: Capability;
};

export type Challenge = {
  id: string;
  name: string;
  prompt: string;
  required: Capability[];
  bonus: Capability[];
};

export type CapabilityResult = {
  capability: Capability;
  covered: boolean;
  builders: string[];
};

export type ComplementarityResult = {
  builder: string;
  needs: Capability;
  covered: boolean;
  coveredBy: string[];
};

export type ScoreResult = {
  total: number;
  coverageScore: number;
  complementarityScore: number;
  bonusScore: number;
  requiredResults: CapabilityResult[];
  complementarityResults: ComplementarityResult[];
  bonusResults: CapabilityResult[];
};

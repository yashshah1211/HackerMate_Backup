/** Display policy, not a persisted trust token. No stored field can opt out. */
export const HISTORICAL_PROVENANCE_LABEL = "Historical provenance unverified";
export const HISTORICAL_PROVENANCE_DESCRIPTION = "Stored scores and feedback are readable, but this record does not prove who generated them or which processing was performed. Stored AI, PDF, timestamp and revision claims are unverified.";
export interface EvaluationRevision { prompt: string; rubric: string; source: string; sourceBase: string }

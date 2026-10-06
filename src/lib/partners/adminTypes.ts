import type { PublicLink } from "./config";

export type PartnerConfigFields = {
  slug: string; partner_name: string; hackathon_id: string; tagline: string | null;
  logo_url: string | null; banner_url: string | null; accent_color: string | null;
  portal_version: "legacy" | "organizer-v1"; official_website: string | null;
  public_contact: PublicLink | null; approved_links: PublicLink[]; registration_mode: "external" | "native" | null;
};
export type ManagedPartner = PartnerConfigFields & { id: string; revision: string };
export type PartnerEventOption = {
  id: string; name: string; type: string | null; archived: boolean | null;
  start_date: string | null; end_date: string | null; mode: string | null; location: string | null;
  min_team_size: number | null; max_team_size: number | null;
};
export type EventOrganizerAccount = { user_id: string; full_name: string | null; created_at: string };

import { prizeLabel } from "./discovery";
export function formatPrizeDisplay(prize: string | null | undefined, currency?: string | null): string {
  return prizeLabel({ prize_pool: prize ?? null, currency });
}

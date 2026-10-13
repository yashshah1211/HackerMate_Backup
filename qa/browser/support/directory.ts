import { expect, type Page } from "@playwright/test";

export const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search builders", exact: true }).filter({ visible: true }).first();
export const builderRows = (page: Page) => page.locator("ul[data-stagger] > li");
export async function search(page: Page, term: string) {
  await searchBox(page).fill(term);
}
export async function expectNames(page: Page, names: string[], exact = false) {
  for (const name of names) await expect(builderRows(page).getByRole("link", { name, exact: true })).toBeVisible();
  if (exact) await expect(builderRows(page)).toHaveCount(names.length);
}
export async function openFilters(page: Page) {
  if ((page.viewportSize()?.width || 1440) < 1024) await page.getByRole("button", { name: "Filters", exact: true }).click();
}
export async function closeFilters(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Filter builders" });
  if (await dialog.isVisible()) await page.keyboard.press("Escape");
}

import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";
import { SupabaseClient } from "@supabase/supabase-js";
import { autoSendPitchEmailsForLeads } from "@/lib/admin/autoSendPitches";
import { extractValidEmails } from "@/lib/admin/constants";

export function normalizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return url.trim().replace(/\/+$/, "");
  } catch {
    return (url || "").trim();
  }
}

async function fetchUnstopCandidates(): Promise<any[]> {
  const raw: any[] = [];
  // Scrape Open, Upcoming, and Ended hackathons for organizer outreach
  const statuses = ["open", "upcoming", "ended"];

  for (const status of statuses) {
    for (let page = 1; page <= 10; page++) {
      try {
        const response = await fetch(
          `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=30&page=${page}&oppstatus=${status}`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/json",
            },
            next: { revalidate: 0 },
          }
        );
        if (response.ok) {
          const data = await response.json();
          const items =
            data?.data?.data ||
            data?.opportunities?.data ||
            data?.data ||
            [];

          if (!Array.isArray(items) || items.length === 0) break;
          items.forEach((opp: any) => {
            const slug = opp.public_url || opp.slug || opp.id;
            if (!slug) return;
            const url = slug.startsWith("http")
              ? slug
              : `https://unstop.com/${slug}`;
            raw.push({
              platform: "Unstop",
              id: opp.id,
              url,
              title: opp.title || opp.name || "Untitled Hackathon",
              college:
                opp.organisation?.name ||
                opp.organisation_name ||
                opp.organisation?.title ||
                "College / Institution",
              startDate: opp.start_date || opp.regnRequirements?.start_regn_dt || null,
              endDate: opp.end_date || opp.regnRequirements?.end_regn_dt || null,
              details: opp.details,
              locations: opp.locations,
              subtype: opp.subtype,
              prizes: opp.prizes,
              status,
            });
          });
        } else {
          break;
        }
      } catch (e) {
        break;
      }
    }
  }
  return raw;
}

async function fetchDevfolioCandidates(): Promise<any[]> {
  try {
    const response = await fetch("https://devfolio.co/hackathons", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 0 },
    });
    if (!response.ok) return [];
    const html = await response.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return [];
    const json = JSON.parse(match[1]);
    const queries = json.props?.pageProps?.dehydratedState?.queries || [];
    const listData = queries[0]?.state?.data || {};

    const rawList = [
      ...(listData.open_hackathons || []),
      ...(listData.upcoming_hackathons || []),
      ...(listData.featured_hackathons || []),
      ...(listData.ended_hackathons || []),
      ...(listData.past_hackathons || []),
    ];

    const seen = new Set<string>();
    const results: any[] = [];
    for (const opp of rawList) {
      if (!opp.slug || seen.has(opp.slug)) continue;
      seen.add(opp.slug);
      results.push({
        platform: "Devfolio",
        id: opp.uuid || opp.slug,
        slug: opp.slug,
        url: `https://${opp.slug}.devfolio.co`,
        title: opp.name,
        college: "Devfolio Partner",
        startDate: opp.starts_at || null,
        endDate: opp.ends_at || null,
        isOnline: opp.is_online,
        city: opp.city,
        country: opp.country,
      });
    }
    return results;
  } catch (e) {
    console.warn("[Devfolio Scraper] Fetch error:", e);
    return [];
  }
}

async function fetchHack2SkillCandidates(): Promise<any[]> {
  try {
    const response = await fetch(
      "https://hack2skill.com/api/v1/innovator/public/event/list?page=1&records=100",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: "https://hack2skill.com/",
        },
        next: { revalidate: 0 },
      }
    );
    if (!response.ok) return [];
    const json = await response.json();
    const raw = [
      ...(json.data?.flagshipEvents || []),
      ...(json.data?.communityEvents || []),
      ...(json.data?.pastEvents || []),
      ...(json.data?.completedEvents || []),
    ];

    const seen = new Set<string>();
    const results: any[] = [];
    for (const opp of raw) {
      const slug = opp.eventUrl || opp._id;
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const url = opp.customEventUrl
        ? opp.customEventUrl.split("?")[0]
        : `https://hack2skill.com/event/${slug}`;

      results.push({
        platform: "Hack2Skill",
        id: opp._id || slug,
        slug,
        url,
        title: opp.title,
        college: "Hack2Skill Partner",
        startDate: opp.registrationStart || opp.startDate || null,
        endDate: opp.registrationEnd || opp.endDate || null,
        mode: opp.tags?.mode?.value === "VIRTUAL" ? "online" : "in-person",
      });
    }
    return results;
  } catch (e) {
    console.warn("[Hack2Skill Scraper] Fetch error:", e);
    return [];
  }
}

function normalizeNameForDedup(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/hackathon|202\d|–|-|—|:|\|/gi, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function runMultiPlatformScraper(supabaseAdmin: SupabaseClient) {
  // 1. Fetch all previously scraped URLs & names from DB (organizer_leads + hackathons + partner_configs) for deduplication
  const [existingLeadsRes, existingHackathonsRes, partnerConfigsRes] = await Promise.all([
    supabaseAdmin.from("organizer_leads").select("unstop_url"),
    supabaseAdmin.from("hackathons").select("name, website_url"),
    supabaseAdmin.from("partner_configs").select("partner_name, features"),
  ]);

  if (existingLeadsRes.error) {
    console.error("[Scraper] Error fetching existing leads:", existingLeadsRes.error);
  }

  const existingUrlsSet = new Set<string>([
    ...(existingLeadsRes.data || []).map((l) => normalizeUrl(l.unstop_url)).filter(Boolean),
    ...(existingHackathonsRes.data || []).map((h) => normalizeUrl(h.website_url)).filter(Boolean),
    ...(partnerConfigsRes.data || []).map((p) => normalizeUrl(p.features?.website_url)).filter(Boolean),
  ]);

  const existingNamesSet = new Set<string>([
    ...(existingHackathonsRes.data || []).map((h) => normalizeNameForDedup(h.name)).filter(Boolean),
    ...(partnerConfigsRes.data || []).map((p) => normalizeNameForDedup(p.partner_name)).filter(Boolean),
  ]);

  // 2. Fetch candidates concurrently from Unstop (Open, Upcoming, Ended), Devfolio, and Hack2Skill
  const [unstopCandidates, devfolioCandidates, hack2skillCandidates] = await Promise.all([
    fetchUnstopCandidates(),
    fetchDevfolioCandidates(),
    fetchHack2SkillCandidates(),
  ]);

  const allCandidates = [
    ...unstopCandidates,
    ...devfolioCandidates,
    ...hack2skillCandidates,
  ];

  if (allCandidates.length === 0) {
    return {
      message: "No hackathons found across Unstop, Devfolio, and Hack2Skill at this time",
      count: 0,
      leads: [],
      skippedInRun: 0,
    };
  }

  // 3. Strict Filter: Skip any hackathons that were EVER scraped before, are currently in DB by URL/name, or match partner pages
  const seenUrlsInBatch = new Set<string>();
  const seenNamesInBatch = new Set<string>();

  const freshCandidates = allCandidates.filter((opp) => {
    if (!opp.url) return false;
    const normUrl = opp.url;
    const normName = normalizeNameForDedup(opp.title);

    if (existingUrlsSet.has(normUrl) || seenUrlsInBatch.has(normUrl)) {
      return false;
    }
    if (normName && (existingNamesSet.has(normName) || seenNamesInBatch.has(normName))) {
      return false;
    }

    seenUrlsInBatch.add(normUrl);
    if (normName) seenNamesInBatch.add(normName);
    return true;
  });

  if (freshCandidates.length === 0) {
    return {
      message: `Checked ${allCandidates.length} hackathons across Unstop, Devfolio & Hack2Skill. All active/past hackathons have already been processed!`,
      count: 0,
      leads: [],
      skippedInRun: 0,
    };
  }

  // 4. Cap per invocation & Batch detail-fetches sequentially with polite delay to ensure legal & respectful scraping
  const MAX_PER_RUN = 50;
  const candidatesToFetch = freshCandidates.slice(0, MAX_PER_RUN);
  const skippedInRunCount = freshCandidates.length - candidatesToFetch.length;

  const BATCH_SIZE = 5;
  const resolvedItems: any[] = [];

  for (let i = 0; i < candidatesToFetch.length; i += BATCH_SIZE) {
    const chunk = candidatesToFetch.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (opp: any) => {
        try {
          let organizer_email: string | null = null;
          let description = `${opp.title} hosted on ${opp.platform}.`;
          let location = opp.mode === "online" ? "Online" : "Venue in India";
          let mode = opp.mode || "online";
          let prize_pool = "Certificate & Perks";
          let currency = "INR";

          let isEnded =
            opp.status === "ended" ||
            opp.status === "closed" ||
            (opp.endDate && new Date(opp.endDate) < new Date());

          let actualEndDate = opp.endDate || null;

          if (opp.platform === "Unstop") {
            if (opp.id) {
              try {
                const compRes = await fetch(
                  `https://unstop.com/api/public/competition/${opp.id}`,
                  {
                    headers: {
                      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                      Accept: "application/json",
                      Referer: "https://unstop.com/",
                    },
                  }
                );
                if (compRes.ok) {
                  const compJson = await compRes.json();
                  const comp = compJson?.data?.competition || compJson?.data || {};
                  const contacts = comp.contacts || [];
                  const emails = contacts
                    .map((c: any) => c.email?.trim())
                    .filter((e: any) => e && e.includes("@"));

                  if (emails.length > 0) {
                    organizer_email = Array.from(new Set(emails)).join(", ");
                  } else {
                    // Deep Contact Extraction: Scan full competition payload (overview, rules, attachments) for '@' emails
                    const deepEmails = extractValidEmails(JSON.stringify(compJson));
                    if (deepEmails.length > 0) {
                      organizer_email = Array.from(new Set(deepEmails)).join(", ");
                    }
                  }

                  // Second Deep Fallback: Fetch raw HTML page if email is still missing
                  if (!organizer_email && opp.url) {
                    try {
                      const pageRes = await fetch(opp.url, {
                        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
                      });
                      if (pageRes.ok) {
                        const html = await pageRes.text();
                        const pageEmails = extractValidEmails(html);
                        if (pageEmails.length > 0) {
                          organizer_email = Array.from(new Set(pageEmails)).join(", ");
                        }
                      }
                    } catch (e) {}
                  }

                  const regReq = comp.regnRequirements || {};
                  if (regReq.end_regn_dt) {
                    actualEndDate = regReq.end_regn_dt;
                  }
                  if (
                    regReq.reg_status === "FINISHED" ||
                    regReq.remain_days === "Ended" ||
                    (regReq.end_regn_dt && new Date(regReq.end_regn_dt) < new Date())
                  ) {
                    isEnded = true;
                  }
                }
              } catch (e) {}
            }
            if (opp.details) {
              description = opp.details.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
            }
            if (opp.locations && opp.locations.length > 0) {
              location = opp.locations.join(", ");
              mode = "in-person";
            }
            if (opp.prizes && opp.prizes.length > 0) {
              const prizeObj = opp.prizes.find((p: any) => p && p.cash) || opp.prizes[0];
              const pCode = (prizeObj.currencyCode || prizeObj.currency_code || prizeObj.currency || "").toUpperCase();
              const pSym = prizeObj.currency_symbol || prizeObj.unit || "";
              const pCurrName = (prizeObj.currency || "").toLowerCase();

              if (pCode === "USD" || pSym === "$" || pCurrName.includes("dollar")) {
                currency = "USD";
              } else if (pCode === "INR" || pSym === "₹" || pCurrName.includes("rupee")) {
                currency = "INR";
              } else {
                currency = "INR";
              }

              if (prizeObj.cash) {
                const symbol = currency === "USD" ? "$" : "₹";
                const numVal = Number(prizeObj.cash);
                prize_pool = `${symbol} ${numVal.toLocaleString(currency === "USD" ? "en-US" : "en-IN")}`;
              }
            }
          } else if (opp.platform === "Devfolio") {
            try {
              const detailRes = await fetch(`https://${opp.slug}.devfolio.co/`, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
              });
              if (detailRes.ok) {
                const html = await detailRes.text();
                const emails = extractValidEmails(html);
                if (emails.length > 0) {
                  organizer_email = emails.join(", ");
                }
                const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
                if (match) {
                  const json = JSON.parse(match[1]);
                  const detail = json.props?.pageProps?.hackathon || json.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data || {};
                  if (detail.desc) {
                    description = detail.desc.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
                  } else if (detail.tagline) {
                    description = detail.tagline;
                  }
                }
              }
            } catch (e) {}
            mode = opp.isOnline ? "online" : "in-person";
            if (opp.city) {
              location = `${opp.city}${opp.country ? `, ${opp.country}` : ""}`;
            }
            if (opp.title && (opp.title.includes("$") || /\bUSD\b/i.test(opp.title))) {
              currency = "USD";
            }
          } else if (opp.platform === "Hack2Skill") {
            try {
              const detailRes = await fetch(`https://hack2skill.com/event/${opp.slug}`, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
              });
              if (detailRes.ok) {
                const html = await detailRes.text();
                const emails = extractValidEmails(html);
                if (emails.length > 0) {
                  organizer_email = emails.join(", ");
                }
              }
            } catch (e) {}
          }

          const event_date = opp.startDate
            ? new Date(opp.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "Upcoming";

          return {
            isEnded,
            lead: {
              title: `${opp.title} (${opp.platform})`,
              college_or_host: opp.college,
              unstop_url: opp.url,
              organizer_email,
              event_date,
              status: organizer_email ? "new" : "no_email",
            },
            hackathonRecord: {
              name: opp.title,
              description,
              start_date: opp.startDate || null,
              end_date: actualEndDate || opp.endDate || null,
              location,
              mode,
              prize_pool,
              currency,
              website_url: opp.url,
              type: "external",
              tags: [opp.platform, "Coding", "Hackathon"],
              college: opp.college !== "College / Institution" && opp.college !== "Devfolio Partner" && opp.college !== "Hack2Skill Partner" ? opp.college : null,
            },
          };
        } catch (itemErr) {
          console.warn(`[Scraper] Error processing ${opp.platform} item:`, itemErr);
          return null;
        }
      })
    );
    resolvedItems.push(...chunkResults);
  }

  const validProcessedItems = resolvedItems.filter(
    (item): item is NonNullable<typeof item> => item !== null
  );

  // 5. ORGANIZER OUTREACH LEADS: Strict email constraint (only save leads with valid organizer email)
  const validLeadsToUpsert = validProcessedItems
    .map((item) => item.lead)
    .filter((lead) => lead.organizer_email && lead.organizer_email.trim().length > 0);

  // 6. MAIN HACKATHONS TAB: ZERO email constraint! All live/upcoming hackathons appear for student team-building
  const todayStr = new Date().toISOString().split("T")[0];
  const activeHackathonsToUpsert = validProcessedItems
    .filter((item) => !item.isEnded)
    .map((item) => item.hackathonRecord)
    .filter((h) => {
      if (!h.website_url) return false;
      // Exclude ended hackathons from student hackathons tab
      if (h.end_date) {
        const endDateStr = new Date(h.end_date).toISOString().split("T")[0];
        if (endDateStr < todayStr) return false;
      }
      return true;
    });

  let insertedLeadsCount = 0;
  let insertedData: any[] = [];
  let autoPitchResult: any = null;

  if (validLeadsToUpsert.length > 0) {
    const { data: inserted, error: dbError } = await supabaseAdmin
      .from("organizer_leads")
      .insert(validLeadsToUpsert)
      .select();

    if (dbError) {
      console.error("[Scraper] DB Error inserting organizer_leads:", dbError);
    } else {
      insertedData = inserted || [];
      insertedLeadsCount = insertedData.length;

      // Automatically dispatch pitch emails immediately for newly scraped organizer leads
      if (insertedData.length > 0) {
        autoPitchResult = await autoSendPitchEmailsForLeads(supabaseAdmin, insertedData);
        console.log(`[Scraper Auto-Pitch] Automatically dispatched ${autoPitchResult.sent} pitch emails for ${insertedData.length} new leads.`);
      }
    }
  }

  // 7. Upsert ALL active/upcoming scraped hackathons into public.hackathons for student team-building (ZERO email constraint)
  if (activeHackathonsToUpsert.length > 0) {
    const normalizedHackathons = activeHackathonsToUpsert.map((h) => ({
      ...h,
      website_url: normalizeUrl(h.website_url),
    }));

    const { error: hackathonsDbErr } = await supabaseAdmin
      .from("hackathons")
      .upsert(normalizedHackathons, { onConflict: "website_url" });

    if (hackathonsDbErr) {
      console.error("[Scraper] Error upserting active hackathons to public.hackathons:", hackathonsDbErr);
    } else {
      console.log(`[Scraper] Successfully upserted ${normalizedHackathons.length} live/upcoming hackathons to main Hackathons tab.`);
    }
  }

  // 8. Automatic Purge: Clean up any existing external hackathons in public.hackathons that have ended
  try {
    const { data: pastExternalHackathons } = await supabaseAdmin
      .from("hackathons")
      .select("id, end_date")
      .eq("type", "external");

    if (pastExternalHackathons && pastExternalHackathons.length > 0) {
      const now = new Date();
      const closedIds = pastExternalHackathons
        .filter((h) => h.end_date && new Date(h.end_date) < now)
        .map((h) => h.id);

      if (closedIds.length > 0) {
        await supabaseAdmin.from("hackathons").delete().in("id", closedIds);
      }
    }
  } catch (purgeErr) {
    console.warn("[Scraper] Non-critical error puring ended hackathons:", purgeErr);
  }

  return {
    success: true,
    count: insertedLeadsCount,
    leads: insertedData,
    skippedInRun: skippedInRunCount,
    message:
      insertedLeadsCount > 0
        ? `Fetched ${insertedLeadsCount} new organizer leads with valid emails across Unstop, Devfolio & Hack2Skill!`
        : `Scraped platforms. No new hackathons with public organizer emails found in this run.`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;
    const result = await runMultiPlatformScraper(supabaseAdmin);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Scraper] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

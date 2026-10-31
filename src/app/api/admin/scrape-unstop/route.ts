import { eventState } from "@/lib/hackathons/lifecycle";
import { sourceDate, ingestionSnapshot, deadlineRefresh, REGISTRATION_FIELDS, registrationInstant } from "@/lib/hackathons/ingestion";
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
              startDate: sourceDate(opp.start_date),
              registrationStart: sourceDate(opp.regnRequirements?.start_regn_dt),
              registrationEnd: sourceDate(opp.regnRequirements?.end_regn_dt),
              endDate: sourceDate(opp.end_date),
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
        startDate: sourceDate(opp.starts_at),
        endDate: sourceDate(opp.ends_at),
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
        startDate: sourceDate(opp.startDate),
        registrationStart: sourceDate(opp.registrationStart),
        registrationEnd: sourceDate(opp.registrationEnd),
        endDate: sourceDate(opp.endDate),
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
    supabaseAdmin.from("hackathons").select("id,name,website_url,type,organizer_id,status,archived,registration_start,registration_end,registration_status,ai_feedback"),
    supabaseAdmin.from("partner_configs").select("hackathon_id,partner_name,features"),
  ]);

  if (existingLeadsRes.error) {
    console.error("[Scraper] Error fetching existing leads:", existingLeadsRes.error);
  }

  for (const result of [existingHackathonsRes, partnerConfigsRes]) if (result.error) {
    console.error("Scraper ownership lookup failed:", result.error);
    throw new Error("Catalog ownership could not be verified; no writes attempted.");
  }
  if (existingLeadsRes.error) throw new Error("Lead deduplication could not be verified; no writes attempted.");
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

  const partnerIds = new Set((partnerConfigsRes.data || []).map(p => p.hackathon_id));
  const refreshRows = new Map((existingHackathonsRes.data || []).filter(row => row.id && row.type === "external" && !row.organizer_id
    && row.status === "approved" && row.archived === false && !partnerIds.has(row.id)
    && !(partnerConfigsRes.data || []).some(p => normalizeUrl(p.features?.website_url) === normalizeUrl(row.website_url) || normalizeNameForDedup(p.partner_name) === normalizeNameForDedup(row.name))
    && row.ai_feedback?.lifecycle_ingestion?.version === 1).map(row => [normalizeUrl(row.website_url), row]));
  const refreshCandidates = [...new Map(allCandidates.filter(opp => refreshRows.has(normalizeUrl(opp.url)))
    .map(opp => [normalizeUrl(opp.url), opp])).values()].slice(0, 20);
  if (freshCandidates.length === 0 && refreshCandidates.length === 0) {
    return {
      message: `Checked ${allCandidates.length} hackathons across Unstop, Devfolio & Hack2Skill. All active/past hackathons have already been processed!`,
      count: 0,
      leads: [],
      skippedInRun: 0,
    };
  }

  // 4. Cap per invocation & Batch detail-fetches sequentially with polite delay to ensure legal & respectful scraping
  const MAX_PER_RUN = 50;
  const candidatesToFetch = [...freshCandidates.slice(0, MAX_PER_RUN), ...refreshCandidates];
  const skippedInRunCount = Math.max(0, freshCandidates.length - MAX_PER_RUN);

  const BATCH_SIZE = 5;
  const resolvedItems: any[] = [];

  for (let i = 0; i < candidatesToFetch.length; i += BATCH_SIZE) {
    const chunk = candidatesToFetch.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (opp: any) => {
        try {
          let organizer_email: string | null = null;
          let description = `${opp.title} hosted on ${opp.platform}.`;
          let location: string | null = opp.mode === "online" ? "Online" : null;
          let mode: string | null = opp.mode || null;
          let prize_pool: string | null = null;
          let currency: string | null = null;

          const isEnded = eventState({ start_date: opp.startDate, end_date: opp.endDate }, Date.now()) === "ended";
          let registration_start = sourceDate(opp.registrationStart);
          let registration_end = sourceDate(opp.registrationEnd);
          let registration_status: string | null = null;
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
                  registration_start = sourceDate(regReq.start_regn_dt) || registration_start;
                  registration_end = sourceDate(regReq.end_regn_dt) || registration_end;
                  registration_status = regReq.reg_status === "FINISHED" ? "closed" : regReq.reg_status === "OPEN" ? "open" : null;
                }
              } catch (e) {}
            }
            if (opp.details) {
              description = opp.details;
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
                currency = null;
              }

              if (prizeObj.cash) {
                const symbol = currency === "USD" ? "$" : currency === "INR" ? "₹" : "";
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
                    description = detail.desc;
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

          registration_start = registrationInstant(registration_start);
          registration_end = registrationInstant(registration_end, true);
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
              end_date: opp.endDate || null,
              registration_start, registration_end, registration_status,
              ai_feedback: { lifecycle_ingestion: ingestionSnapshot(normalizeUrl(opp.url), opp.platform, { registration_start, registration_end, registration_status }) },
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
    .filter(item => !refreshRows.has(normalizeUrl(item.hackathonRecord.website_url)))
    .map((item) => item.lead)
    .filter((lead) => lead.organizer_email && lead.organizer_email.trim().length > 0);

  // 6. MAIN HACKATHONS TAB: ZERO email constraint! All live/upcoming hackathons appear for student team-building
  const activeHackathonsToUpsert = validProcessedItems
    .filter((item) => !item.isEnded && !refreshRows.has(normalizeUrl(item.hackathonRecord.website_url)))
    .map((item) => item.hackathonRecord)
    .filter((h) => {
      if (!h.website_url) return false;
      return true;
    });

  for (const item of validProcessedItems) {
    const row = refreshRows.get(normalizeUrl(item.hackathonRecord.website_url));
    if (!row) continue;
    const { data: protectedPartners, error: partnerCheckError } = await supabaseAdmin.from("partner_configs").select("hackathon_id").eq("hackathon_id", row.id).limit(1);
    if (partnerCheckError) { console.error("Scraper partner refresh guard failed:", partnerCheckError); continue; }
    if (!Array.isArray(protectedPartners) || protectedPartners.length) continue;
    const patch = deadlineRefresh(row, item.hackathonRecord.ai_feedback.lifecycle_ingestion);
    if (!patch) continue;
    // Compare-and-set protects editorial changes made while the provider request was in flight.
    let query = supabaseAdmin.from("hackathons").update({ ...patch.values, ai_feedback: patch.feedback })
      .eq("id", row.id).eq("type", "external").eq("status", row.status).eq("archived", false)
      .is("organizer_id", null).eq("website_url", row.website_url).eq("ai_feedback", JSON.stringify(row.ai_feedback));
    for (const field of REGISTRATION_FIELDS) query = row[field] == null ? query.is(field, null) : query.eq(field, row[field]);
    const { error } = await query;
    if (error) console.error("Scraper deadline refresh failed:", error);
  }

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
        console.log(`[Scraper Auto-Pitch] Provider accepted ${autoPitchResult.accepted || 0} emails; ${autoPitchResult.unknown || 0} unknown. Delivery is not confirmed.`);
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
      .upsert(normalizedHackathons, { onConflict: "website_url", ignoreDuplicates: true });

    if (hackathonsDbErr) {
      console.error("[Scraper] Error upserting active hackathons to public.hackathons:", hackathonsDbErr);
    } else {
      console.log(`[Scraper] Successfully upserted ${normalizedHackathons.length} live/upcoming hackathons to main Hackathons tab.`);
    }
  }

  return {
    success: true,
    autoPitchResult,
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

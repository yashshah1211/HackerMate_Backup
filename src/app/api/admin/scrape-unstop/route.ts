import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";

function extractValidEmails(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const validTldRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|in|org|io|co|net|edu|dev|tech|app|xyz|me|global|ai)$/i;

  const valid = matches.filter((email) => {
    const lower = email.toLowerCase().trim();
    if (
      lower.endsWith(".css") ||
      lower.endsWith(".js") ||
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".svg") ||
      lower.endsWith(".webp")
    ) {
      return false;
    }
    if (
      lower.includes("sentry") ||
      lower.includes("w3.org") ||
      lower.includes("schema.org") ||
      lower.includes("example.com")
    ) {
      return false;
    }
    return validTldRegex.test(lower);
  });

  return Array.from(new Set(valid.map((e) => e.trim())));
}

async function fetchUnstopCandidates(): Promise<any[]> {
  const raw: any[] = [];
  for (let page = 1; page <= 15; page++) {
    try {
      const response = await fetch(
        `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=30&page=${page}&oppstatus=open`,
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
          });
        });
      } else {
        break;
      }
    } catch (e) {
      break;
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
        startDate: opp.registrationStart || null,
        endDate: opp.registrationEnd || null,
        mode: opp.tags?.mode?.value === "VIRTUAL" ? "online" : "in-person",
      });
    }
    return results;
  } catch (e) {
    console.warn("[Hack2Skill Scraper] Fetch error:", e);
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth Gate via Shared Helper
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    // 2. Fetch all previously scraped URLs from DB (organizer_leads + hackathons) for deduplication
    const [existingLeadsRes, existingHackathonsRes] = await Promise.all([
      supabaseAdmin.from("organizer_leads").select("unstop_url"),
      supabaseAdmin.from("hackathons").select("website_url"),
    ]);

    if (existingLeadsRes.error) {
      console.error("[Scraper] Error fetching existing leads:", existingLeadsRes.error);
    }

    const existingUrlsSet = new Set<string>([
      ...(existingLeadsRes.data || []).map((l) => l.unstop_url).filter(Boolean),
      ...(existingHackathonsRes.data || []).map((h) => h.website_url).filter(Boolean),
    ]);

    // 3. Fetch candidates concurrently from Unstop, Devfolio, and Hack2Skill
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
      return NextResponse.json({
        message: "No hackathons found across Unstop, Devfolio, and Hack2Skill at this time",
        count: 0,
      });
    }

    // 4. Strict Filter: Skip any hackathons that were EVER scraped before or are currently in DB
    const seenUrlsInBatch = new Set<string>();
    const freshCandidates = allCandidates.filter((opp) => {
      if (!opp.url) return false;
      if (existingUrlsSet.has(opp.url) || seenUrlsInBatch.has(opp.url)) {
        return false;
      }
      seenUrlsInBatch.add(opp.url);
      return true;
    });

    if (freshCandidates.length === 0) {
      return NextResponse.json({
        message: `Checked ${allCandidates.length} hackathons across Unstop, Devfolio & Hack2Skill. All active hackathons have already been processed!`,
        count: 0,
      });
    }

    // 5. Cap per invocation & Batch detail-fetches sequentially to prevent timeouts
    const MAX_PER_RUN = 40;
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
              if (opp.prizes && opp.prizes[0] && opp.prizes[0].cash) {
                prize_pool = `₹ ${Number(opp.prizes[0].cash).toLocaleString("en-IN")}`;
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
              lead: {
                title: `${opp.title} (${opp.platform})`,
                college_or_host: opp.college,
                unstop_url: opp.url,
                organizer_email,
                event_date,
                status: "new",
              },
              hackathonRecord: {
                name: opp.title,
                description,
                start_date: opp.startDate || null,
                end_date: opp.endDate || null,
                location,
                mode,
                prize_pool,
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

    // 6. Only insert into organizer_leads if there is a valid organizer_email
    const validLeadsToUpsert = validProcessedItems
      .map((item) => item.lead)
      .filter((lead) => lead.organizer_email && lead.organizer_email.trim().length > 0);

    const hackathonsToUpsert = validProcessedItems
      .map((item) => item.hackathonRecord)
      .filter((h) => !!h.website_url);

    let insertedLeadsCount = 0;
    let insertedData: any[] = [];
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
      }
    }

    // 7. Upsert scraped hackathons into public.hackathons table for student discovery
    if (hackathonsToUpsert.length > 0) {
      const { error: hackathonsDbErr } = await supabaseAdmin
        .from("hackathons")
        .upsert(hackathonsToUpsert, { onConflict: "website_url" });

      if (hackathonsDbErr) {
        // Fallback: insert ignoring duplicates if unique constraint on website_url isn't present
        await supabaseAdmin.from("hackathons").insert(hackathonsToUpsert);
      }
    }

    return NextResponse.json({
      success: true,
      count: insertedLeadsCount,
      leads: insertedData,
      skippedInRun: skippedInRunCount,
      message:
        insertedLeadsCount > 0
          ? `Fetched ${insertedLeadsCount} new organizer leads across Unstop, Devfolio & Hack2Skill!`
          : `Processed hackathons from Unstop, Devfolio & Hack2Skill. No new leads with public emails found in this run.`,
    });
  } catch (err: any) {
    console.error("[Scraper] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

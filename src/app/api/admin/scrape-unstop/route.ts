import { NextRequest, NextResponse } from "next/server";
import { requireOutreachAdmin } from "@/lib/admin/requireOutreachAdmin";

export async function POST(req: NextRequest) {
  try {
    // 1. Auth Gate via Shared Helper
    const authResult = await requireOutreachAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { supabaseAdmin } = authResult;

    // 2. Fetch all previously scraped unstop_urls from DB to guarantee NO re-scraping
    const { data: existingLeads, error: fetchErr } = await supabaseAdmin
      .from("organizer_leads")
      .select("unstop_url");

    if (fetchErr) {
      console.error("[Unstop Scraper] Error fetching existing leads:", fetchErr);
    }

    const existingUrlsSet = new Set<string>(
      (existingLeads || []).map((l) => l.unstop_url)
    );

    // 3. Multi-page fetch from Unstop (Pages 1 to 5, 30 per page = up to 150 hackathons)
    const rawOpportunities: any[] = [];
    let payloadWarning = false;

    for (let page = 1; page <= 5; page++) {
      try {
        const unstopApiUrl = `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=30&page=${page}&oppstatus=open`;
        const response = await fetch(unstopApiUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "application/json",
          },
          next: { revalidate: 0 },
        });

        if (response.ok) {
          const unstopData = await response.json();
          const items =
            unstopData?.data?.data ||
            unstopData?.opportunities?.data ||
            unstopData?.data ||
            [];

          if (!Array.isArray(items) || (items.length === 0 && page === 1)) {
            console.warn(`[Unstop Scraper] Warning: Unstop API response shape differed or returned empty array on page ${page}:`, unstopData);
            payloadWarning = true;
          }
          
          if (Array.isArray(items)) {
            rawOpportunities.push(...items);
          }
        }
      } catch (err) {
        console.warn(`[Unstop Scraper] Failed to fetch page ${page}:`, err);
      }
    }

    if (rawOpportunities.length === 0) {
      return NextResponse.json({
        message: "No open hackathons found on Unstop at this time",
        count: 0,
        warning: payloadWarning ? "Unstop API response structure may have changed. Check server logs." : undefined,
      });
    }

    // 4. Strict Filter: Skip any hackathons that were EVER scraped before or are currently in DB
    const seenUrlsInBatch = new Set<string>();
    const freshOpportunities = rawOpportunities.filter((opp) => {
      const slug = opp.public_url || opp.slug || opp.id;
      if (!slug) return false;
      const fullUrl = slug.startsWith("http")
        ? slug
        : `https://unstop.com/${slug}`;

      if (existingUrlsSet.has(fullUrl) || seenUrlsInBatch.has(fullUrl)) {
        return false;
      }
      seenUrlsInBatch.add(fullUrl);
      return true;
    });

    if (freshOpportunities.length === 0) {
      return NextResponse.json({
        message: "No new hackathons to scrape! All active Unstop hackathons have already been processed.",
        count: 0,
      });
    }

    // 5. Cap per invocation & Batch detail-fetches sequentially to prevent timeouts & rate limits
    const MAX_PER_RUN = 40;
    const opportunitiesToFetch = freshOpportunities.slice(0, MAX_PER_RUN);
    const skippedInRunCount = freshOpportunities.length - opportunitiesToFetch.length;

    const BATCH_SIZE = 5;
    const resolvedLeads: any[] = [];

    for (let i = 0; i < opportunitiesToFetch.length; i += BATCH_SIZE) {
      const chunk = opportunitiesToFetch.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (opp: any) => {
          try {
            const title = opp.title || opp.name || "Untitled Hackathon";
            const college =
              opp.organisation?.name ||
              opp.organisation_name ||
              opp.organisation?.title ||
              "College / Institution";
            
            const slug = opp.public_url || opp.slug || opp.id;
            const unstop_url = slug?.startsWith("http")
              ? slug
              : `https://unstop.com/${slug}`;

            let organizer_email: string | null = null;
            const event_date =
              opp.regnRequirements?.start_regn_dt ||
              opp.start_date ||
              opp.end_date ||
              "Upcoming";

            if (opp.id) {
              try {
                const compRes = await fetch(
                  `https://unstop.com/api/public/competition/${opp.id}`,
                  {
                    headers: {
                      "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                      Accept: "application/json",
                      Referer: "https://unstop.com/",
                    },
                  }
                );

                if (compRes.ok) {
                  const compJson = await compRes.json();
                  const comp = compJson?.data?.competition || compJson?.data || {};
                  const contacts = comp.contacts || [];

                  const emails: string[] = contacts
                    .map((c: any) => c.email?.trim())
                    .filter((e: any) => e && e.includes("@"));

                  if (emails.length > 0) {
                    organizer_email = Array.from(new Set(emails)).join(", ");
                  }
                }
              } catch (fetchErr) {
                console.warn(`[Unstop Scraper] Could not fetch detail for ID ${opp.id}:`, fetchErr);
              }
            }

            if (!organizer_email) return null;

            return {
              title,
              college_or_host: college,
              unstop_url,
              organizer_email,
              event_date: typeof event_date === "string" ? event_date.substring(0, 50) : "Upcoming",
              status: "new",
            };
          } catch (itemErr) {
            console.warn(`[Unstop Scraper] Error processing hackathon item:`, itemErr);
            return null;
          }
        })
      );
      resolvedLeads.push(...chunkResults);
    }

    const validLeadsToUpsert = resolvedLeads.filter(
      (lead): lead is NonNullable<typeof lead> => lead !== null
    );

    if (validLeadsToUpsert.length === 0) {
      return NextResponse.json({
        message: "Scraped fresh hackathons, but none had public organizer emails listed.",
        count: 0,
        skippedInRun: skippedInRunCount,
      });
    }

    // 6. Insert new unique leads into Supabase
    const { data: insertedData, error: dbError } = await supabaseAdmin
      .from("organizer_leads")
      .insert(validLeadsToUpsert)
      .select();

    if (dbError) {
      console.error("[Unstop Scraper] DB Error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: insertedData?.length || 0,
      leads: insertedData,
      skippedInRun: skippedInRunCount,
      message: skippedInRunCount > 0
        ? `Fetched ${insertedData?.length || 0} leads (Capped at ${MAX_PER_RUN} per run. ${skippedInRunCount} remaining - click again to fetch more).`
        : undefined,
    });
  } catch (err: any) {
    console.error("[Unstop Scraper] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

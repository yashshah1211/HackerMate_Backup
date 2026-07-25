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
    // 2. Fetch all previously scraped unstop_urls from DB (organizer_leads + hackathons) to guarantee NO re-scraping
    const [existingLeadsRes, existingHackathonsRes] = await Promise.all([
      supabaseAdmin.from("organizer_leads").select("unstop_url"),
      supabaseAdmin.from("hackathons").select("website_url"),
    ]);

    if (existingLeadsRes.error) {
      console.error("[Unstop Scraper] Error fetching existing leads:", existingLeadsRes.error);
    }

    const existingUrlsSet = new Set<string>([
      ...(existingLeadsRes.data || []).map((l) => l.unstop_url).filter(Boolean),
      ...(existingHackathonsRes.data || []).map((h) => h.website_url).filter(Boolean),
    ]);

    // 3. Multi-page fetch from Unstop (Pages 1 to 15, 30 per page = up to 450 hackathons)
    const rawOpportunities: any[] = [];
    let payloadWarning = false;
    let pagesFetched = 0;

    for (let page = 1; page <= 15; page++) {
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

          if (!Array.isArray(items) || items.length === 0) {
            if (page === 1) {
              console.warn(`[Unstop Scraper] Warning: Unstop API returned empty array on page 1:`, unstopData);
              payloadWarning = true;
            }
            break; // Reached end of open hackathon results
          }
          
          pagesFetched = page;
          rawOpportunities.push(...items);
        } else {
          break;
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
        message: `Scraped ${pagesFetched} pages (${rawOpportunities.length} hackathons checked). All active Unstop hackathons have already been processed!`,
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

            if (!organizer_email) {
              console.log(`[Unstop Scraper] Lead "${title}" has no public email listed on API. Skipping organizer lead creation.`);
            }

            return {
              lead: {
                title,
                college_or_host: college,
                unstop_url,
                organizer_email,
                event_date: typeof event_date === "string" ? event_date.substring(0, 50) : "Upcoming",
                status: "new",
              },
              hackathonRecord: {
                id: opp.id ? `00000000-0000-0000-0000-${opp.id.toString().padStart(12, "0")}` : undefined,
                name: title,
                description: (opp.details || "No description provided.").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
                start_date: opp.start_date || opp.regnRequirements?.start_regn_dt || null,
                end_date: opp.end_date || opp.regnRequirements?.end_regn_dt || null,
                location: opp.locations && opp.locations.length > 0 ? opp.locations.join(", ") : (opp.subtype?.toLowerCase().includes("offline") ? "Venue in India" : "Online"),
                mode: (opp.locations && opp.locations.length > 0) || opp.subtype?.toLowerCase().includes("offline") ? "in-person" : "online",
                prize_pool: opp.prizes && opp.prizes[0] && opp.prizes[0].cash ? `₹ ${Number(opp.prizes[0].cash).toLocaleString("en-IN")}` : "Certificate & Perks",
                website_url: unstop_url,
                type: "external",
                tags: ["Unstop", "Coding", "Innovation"],
                college: college !== "College / Institution" ? college : null,
              }
            };
          } catch (itemErr) {
            console.warn(`[Unstop Scraper] Error processing hackathon item:`, itemErr);
            return null;
          }
        })
      );
      resolvedLeads.push(...chunkResults);
    }

    const validProcessedItems = resolvedLeads.filter(
      (item): item is NonNullable<typeof item> => item !== null
    );

    const validLeadsToUpsert = validProcessedItems
      .map((item) => item.lead)
      .filter((lead) => lead.organizer_email && lead.organizer_email.trim().length > 0);

    const hackathonsToUpsert = validProcessedItems
      .map((item) => item.hackathonRecord)
      .filter((h) => !!h.id);

    // 6. Insert new unique leads into Supabase organizer_leads (Only those with valid public emails)
    let insertedLeadsCount = 0;
    let insertedData: any[] = [];
    if (validLeadsToUpsert.length > 0) {
      const { data: inserted, error: dbError } = await supabaseAdmin
        .from("organizer_leads")
        .insert(validLeadsToUpsert)
        .select();

      if (dbError) {
        console.error("[Unstop Scraper] DB Error inserting organizer_leads:", dbError);
      } else {
        insertedData = inserted || [];
        insertedLeadsCount = insertedData.length;
      }
    }

    // 7. Upsert scraped hackathons into public.hackathons table (Hackathons Tab)
    if (hackathonsToUpsert.length > 0) {
      const { error: hackathonsDbErr } = await supabaseAdmin
        .from("hackathons")
        .upsert(hackathonsToUpsert, { onConflict: "id" });

      if (hackathonsDbErr) {
        console.error("[Unstop Scraper] DB Error upserting hackathons table:", hackathonsDbErr);
      }
    }




    return NextResponse.json({
      success: true,
      count: insertedLeadsCount,
      leads: insertedData,
      skippedInRun: skippedInRunCount,
      message: skippedInRunCount > 0
        ? `Fetched ${insertedLeadsCount} leads (Capped at ${MAX_PER_RUN} per run. ${skippedInRunCount} remaining - click again to fetch more).`
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


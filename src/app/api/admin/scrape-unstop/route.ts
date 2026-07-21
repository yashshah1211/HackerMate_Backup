import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    // 1. Strict Auth Gate - Restricted Exclusively to yashshah7117@gmail.com
    const supabaseUserClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: () => {},
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUserClient.auth.getUser();

    if (authError || !user || user.email !== "yashshah7117@gmail.com") {
      return NextResponse.json(
        { error: "Forbidden: Exclusive access for yashshah7117@gmail.com" },
        { status: 403 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Clean up uncontacted leads that have NO email
    await supabaseAdmin
      .from("organizer_leads")
      .delete()
      .or("organizer_email.is.null,organizer_email.eq.''")
      .neq("status", "pitch_sent");

    // 3. Multi-page fetch from Unstop (Pages 1 to 3, 30 per page = 90 potential hackathons)
    const rawOpportunities: any[] = [];
    for (let page = 1; page <= 3; page++) {
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
      });
    }

    // Deduplicate opportunities by ID or public_url
    const seenUrls = new Set<string>();
    const uniqueOpportunities = rawOpportunities.filter((opp) => {
      const slug = opp.public_url || opp.slug || opp.id;
      if (!slug || seenUrls.has(slug)) return false;
      seenUrls.add(slug);
      return true;
    });

    // 4. Fetch detailed competition contacts for each hackathon in parallel
    const resolvedLeads = await Promise.all(
      uniqueOpportunities.map(async (opp: any) => {
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

        // STRICT FILTER: Only return lead if a valid organizer email was found!
        if (!organizer_email) {
          return null;
        }

        return {
          title,
          college_or_host: college,
          unstop_url,
          organizer_email,
          event_date: typeof event_date === "string" ? event_date.substring(0, 50) : "Upcoming",
          status: "new",
        };
      })
    );

    // Filter out nulls using TypeScript type guard
    const validLeadsToUpsert = resolvedLeads.filter(
      (lead): lead is NonNullable<typeof lead> => lead !== null
    );

    if (validLeadsToUpsert.length === 0) {
      return NextResponse.json({
        message: "No hackathons with verified organizer emails found",
        count: 0,
      });
    }

    // 5. Upsert valid email leads into Supabase
    const { data: upsertedData, error: dbError } = await supabaseAdmin
      .from("organizer_leads")
      .upsert(validLeadsToUpsert, { onConflict: "unstop_url", ignoreDuplicates: false })
      .select();

    if (dbError) {
      console.error("[Unstop Scraper] DB Error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: upsertedData?.length || 0,
      leads: upsertedData,
    });
  } catch (err: any) {
    console.error("[Unstop Scraper] Exception:", err);
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

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

    // 2. Fetch upcoming hackathons from Unstop Public API
    const unstopApiUrl =
      "https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=25&oppstatus=open";

    const response = await fetch(unstopApiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Unstop API responded with status ${response.status}` },
        { status: 500 }
      );
    }

    const unstopData = await response.json();
    
    // Parse opportunities array from potential response structures
    const opportunities =
      unstopData?.data?.data ||
      unstopData?.opportunities?.data ||
      unstopData?.data ||
      [];

    if (!Array.isArray(opportunities)) {
      return NextResponse.json(
        { error: "Unexpected Unstop API payload structure" },
        { status: 500 }
      );
    }

    // 3. Transform opportunities into leads format
    const leadsToUpsert = opportunities.map((opp: any) => {
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

      const organizer_email =
        opp.contact_detail?.email ||
        opp.organisation?.email ||
        opp.email ||
        null;

      const event_date =
        opp.regnRequirements?.start_regn_dt ||
        opp.start_date ||
        opp.end_date ||
        "Upcoming";

      return {
        title,
        college_or_host: college,
        unstop_url,
        organizer_email,
        event_date: typeof event_date === "string" ? event_date.substring(0, 50) : "Upcoming",
        status: "new",
      };
    });

    if (leadsToUpsert.length === 0) {
      return NextResponse.json({
        message: "No open hackathons found on Unstop at this time",
        count: 0,
      });
    }

    // 4. Save to Supabase using Admin Service Role Key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: upsertedData, error: dbError } = await supabaseAdmin
      .from("organizer_leads")
      .upsert(leadsToUpsert, { onConflict: "unstop_url", ignoreDuplicates: false })
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

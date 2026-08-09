const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Read .env.local
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf8");
  envConfig.split("\n").forEach((line) => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^["']|["']$/g, "");
      process.env[key] = val;
    }
  });
}

async function applyMigration() {
  console.log("==========================================================");
  console.log("🛠️ APPLYING SIH SPOC ALLOWLIST MIGRATION TO DB");
  console.log("==========================================================\n");

  const supabaseService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sql = `
    CREATE TABLE IF NOT EXISTS public.sih_spoc_allowlist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        college_name TEXT NOT NULL DEFAULT 'D.J. Sanghvi College of Engineering (DJSCE)',
        role TEXT NOT NULL DEFAULT 'spoc',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE public.sih_spoc_allowlist ENABLE ROW LEVEL SECURITY;

    GRANT SELECT ON public.sih_spoc_allowlist TO authenticated, anon;
    GRANT ALL ON public.sih_spoc_allowlist TO service_role;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sih_spoc_allowlist' AND policyname = 'Allow public select on sih_spoc_allowlist'
      ) THEN
        CREATE POLICY "Allow public select on sih_spoc_allowlist"
            ON public.sih_spoc_allowlist
            FOR SELECT
            USING (true);
      END IF;
    END
    $$;
  `;

  try {
    await supabaseService.rpc("exec_sql", { sql_query: sql });
  } catch (e) {
    // Ignore if exec_sql rpc is not present
  }

  // Check if table can be queried now
  const { data: testData, error: testErr } = await supabaseService.from("sih_spoc_allowlist").select("*");
  if (testErr) {
    console.error("   ❌ Table Query Error:", testErr);
  } else {
    console.log("   ✅ Table `sih_spoc_allowlist` is active and ready!");
    console.log("   Current count:", testData?.length || 0);
  }
}

applyMigration();

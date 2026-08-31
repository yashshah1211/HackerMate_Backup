import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fetchDatabaseActivity, generateDatabaseActivityPdf } from "../src/lib/admin/databaseActivityReport";

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, "utf-8");
  envConfig.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const val = valueParts.join("=").trim();
      if (key && val) {
        process.env[key.trim()] = val;
      }
    }
  });
}

async function runTest() {
  console.log("🔍 Testing Database Activity Report data aggregation & PDF rendering...");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ Missing Supabase credentials in .env.local");
    process.exit(1);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Query database activity
  const data = await fetchDatabaseActivity(supabaseAdmin);
  console.log("📊 Summary Metrics Aggregated:", JSON.stringify(data.summary, null, 2));

  // Generate PDF
  const pdfBuffer = generateDatabaseActivityPdf(data);
  console.log(`📄 PDF Buffer successfully created! Size: ${pdfBuffer.length} bytes (${Math.round(pdfBuffer.length / 1024)} KB)`);

  const outputPath = path.resolve(__dirname, "test_database_activity_report_output.pdf");
  fs.writeFileSync(outputPath, pdfBuffer);
  console.log(`💾 Saved sample output to: ${outputPath}`);

  console.log("✅ All Database Activity Report tests passed successfully!");
}

runTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

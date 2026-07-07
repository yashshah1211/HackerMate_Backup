const { Client } = require("pg");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function run() {
  console.log("\n=============================================");
  console.log("🛡️  HackerMate Supabase RLS Audit & Fix Tool");
  console.log("=============================================\n");

  let connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  
  if (!connectionString) {
    console.log("To audit your live database, you need your PostgreSQL Connection String.");
    console.log("You can find this in your Supabase Dashboard under: Settings -> Database -> Connection URI.");
    console.log("Example format: postgresql://postgres.[your-project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres\n");
    
    connectionString = await askQuestion("🔑 Paste your Supabase Connection URI: ");
  }

  if (!connectionString) {
    console.error("❌ Error: No connection string provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    console.log("\n📡 Connecting to your remote database...");
    await client.connect();
    console.log("✅ Connected successfully!");

    // 1. Audit RLS disabled tables
    console.log("\n🔍 Phase 1: Checking for tables with RLS DISABLED (High Vulnerability)...");
    const rlsDisabledResult = await client.query(`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND NOT c.relrowsecurity
      ORDER BY c.relname;
    `);

    const disabledTables = rlsDisabledResult.rows.map(r => r.table_name);
    if (disabledTables.length > 0) {
      console.log(`⚠️  VULNERABILITY FOUND: ${disabledTables.length} table(s) have RLS DISABLED:`);
      disabledTables.forEach(t => console.log(`  • "${t}" (Anyone can read, modify, or delete rows on this table!)`));
      
      const answer = await askQuestion("\n👉 Would you like to ENABLE Row-Level Security on these tables now? (yes/no): ");
      if (answer.toLowerCase() === "yes" || answer.toLowerCase() === "y") {
        for (const table of disabledTables) {
          console.log(`  → ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`);
          await client.query(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`);
        }
        console.log("✅ Row-Level Security has been enabled on all identified tables.");
      }
    } else {
      console.log("✅ Secure: All public tables have RLS enabled.");
    }

    // 2. Audit tables with RLS enabled but 0 policies
    console.log("\n🔍 Phase 2: Checking for RLS tables with ZERO policies (Access Blocked)...");
    const noPoliciesResult = await client.query(`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND NOT EXISTS (
          SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
        )
      ORDER BY c.relname;
    `);

    const noPolicyTables = noPoliciesResult.rows.map(r => r.table_name);
    if (noPolicyTables.length > 0) {
      console.log(`⚠️  CONFIGURATION ISSUE: ${noPolicyTables.length} table(s) have RLS enabled but 0 policies defined:`);
      noPolicyTables.forEach(t => console.log(`  • "${t}" (All client queries to this table will fail or return empty arrays!)`));
      console.log("💡 Fix: You must write access policies for these tables so authenticated users can read/write them.");
    } else {
      console.log("✅ Secure: All RLS-enabled tables have at least one access policy defined.");
    }

    // 3. Audit weak policies
    console.log("\n🔍 Phase 3: Checking for weak/open policies (USING (true) / auth.uid() IS NOT NULL)...");
    const weakPoliciesResult = await client.query(`
      SELECT 
        c.relname AS table_name,
        p.polname AS policy_name,
        p.polcmd AS cmd,
        pg_get_expr(p.polqual, p.polrelid) AS qual
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND (
          pg_get_expr(p.polqual, p.polrelid) = 'true'
          OR pg_get_expr(p.polqual, p.polrelid) ILIKE '%auth.uid() is not null%'
        )
      ORDER BY c.relname, p.polname;
    `);

    if (weakPoliciesResult.rows.length > 0) {
      console.log(`⚠️  WARNING: ${weakPoliciesResult.rows.length} potentially weak or unrestricted policies found:`);
      weakPoliciesResult.rows.forEach(r => {
        const cmdName = r.cmd === "r" ? "SELECT" : r.cmd === "a" ? "INSERT" : r.cmd === "w" ? "UPDATE" : r.cmd === "d" ? "DELETE" : "ALL";
        console.log(`  • Table: "${r.table_name}" | Policy: "${r.policy_name}" | Command: ${cmdName} | Clause: ${r.qual}`);
      });
      console.log("💡 Fix: Ensure these are intentional (e.g. public hackathon listings) and do not leak user-specific profiles/private tables.");
    } else {
      console.log("✅ Secure: No weak USING(true) / auth.uid() IS NOT NULL policies detected.");
    }

    console.log("\n🎉 Database RLS Audit completed successfully!\n");

  } catch (err) {
    console.error("\n❌ Database error occurred during audit:", err.message);
  } finally {
    await client.end();
    rl.close();
  }
}

run();

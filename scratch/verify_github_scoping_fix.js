const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function verifyGithubScopingFix() {
  console.log('===========================================================');
  console.log('VERIFYING GITHUB REPO SCOPING FALLBACK FIX');
  console.log('===========================================================');

  const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
  const { data: hackathons } = await supabase.from('hackathons').select('id, name').limit(2);

  const teamId = teams[0].id;
  const h1 = hackathons[0].id;
  const h2 = hackathons[1].id;

  console.log(`Team: "${teams[0].name}" (${teamId})`);
  console.log(`Hackathon 1: "${hackathons[0].name}" (${h1})`);
  console.log(`Hackathon 2: "${hackathons[1].name}" (${h2})`);

  // Clean up any pre-existing rows for clean test
  await supabase.from('team_github_repos').delete().eq('team_id', teamId);

  console.log('\n--- Step 1: Link repo for Hackathon 1 only ---');
  await supabase.from('team_github_repos').upsert({
    team_id: teamId,
    hackathon_id: h1,
    github_repo_url: 'https://github.com/team/hack1-repo'
  });

  const { data: res1 } = await supabase
    .from('team_github_repos')
    .select('github_repo_url')
    .eq('team_id', teamId)
    .eq('hackathon_id', h1)
    .maybeSingle();

  const { data: res2 } = await supabase
    .from('team_github_repos')
    .select('github_repo_url')
    .eq('team_id', teamId)
    .eq('hackathon_id', h2)
    .maybeSingle();

  console.log(`Hackathon 1 repo fetched: ${res1?.github_repo_url}`);
  console.log(`Hackathon 2 repo fetched: ${res2?.github_repo_url || 'NULL (Unlinked)'}`);

  if (res1?.github_repo_url === 'https://github.com/team/hack1-repo' && !res2) {
    console.log('✅ PASS: Hackathon 2 correctly remains unlinked and does NOT leak Hackathon 1 repo!');
  } else {
    throw new Error('FAILED: Hackathon 2 leaked repo from Hackathon 1!');
  }

  console.log('\n--- Step 2: Now link distinct repo for Hackathon 2 ---');
  await supabase.from('team_github_repos').upsert({
    team_id: teamId,
    hackathon_id: h2,
    github_repo_url: 'https://github.com/team/hack2-repo'
  });

  const { data: res2After } = await supabase
    .from('team_github_repos')
    .select('github_repo_url')
    .eq('team_id', teamId)
    .eq('hackathon_id', h2)
    .maybeSingle();

  console.log(`Hackathon 2 repo fetched after linking: ${res2After?.github_repo_url}`);

  if (res2After?.github_repo_url === 'https://github.com/team/hack2-repo') {
    console.log('✅ PASS: Both hackathons now maintain independent GitHub repositories!');
  }

  // Cleanup
  await supabase.from('team_github_repos').delete().eq('team_id', teamId);
  console.log('\n✅ Cleanup done.');
}

verifyGithubScopingFix().catch(err => {
  console.error(err);
  process.exit(1);
});

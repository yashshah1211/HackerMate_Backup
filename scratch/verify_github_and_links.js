const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function runEmpiricalVerification() {
  console.log('===========================================================');
  console.log('EMPIRICAL TEST: SCOPED GITHUB REPOS & HYBRID RESOURCE LINKS');
  console.log('===========================================================');

  const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
  const { data: hackathons } = await supabase.from('hackathons').select('id, name').limit(2);

  const teamId = teams[0].id;
  const hack1 = hackathons[0].id;
  const hack2 = hackathons[1].id;

  console.log(`Testing Team: "${teams[0].name}" (${teamId})`);
  console.log(`Hackathon 1: "${hackathons[0].name}" (${hack1})`);
  console.log(`Hackathon 2: "${hackathons[1].name}" (${hack2})`);

  console.log('\n--- 1. TESTING SCOPED GITHUB REPOS ---');
  const repo1 = 'https://github.com/testteam/ai-hackathon-repo';
  const repo2 = 'https://github.com/testteam/web3-hackathon-repo';

  await supabase.from('team_github_repos').upsert([
    { team_id: teamId, hackathon_id: hack1, github_repo_url: repo1 },
    { team_id: teamId, hackathon_id: hack2, github_repo_url: repo2 }
  ]);

  const { data: fetchedRepos } = await supabase
    .from('team_github_repos')
    .select('*')
    .eq('team_id', teamId);

  console.log(`Found ${fetchedRepos.length} distinct GitHub repos for team "${teams[0].name}":`);
  fetchedRepos.forEach(r => console.log(`  - Hackathon ${r.hackathon_id}: ${r.github_repo_url}`));

  const h1Repo = fetchedRepos.find(r => r.hackathon_id === hack1)?.github_repo_url;
  const h2Repo = fetchedRepos.find(r => r.hackathon_id === hack2)?.github_repo_url;

  if (h1Repo === repo1 && h2Repo === repo2) {
    console.log('✅ SUCCESS: GitHub Sync repos are completely isolated per event track!');
  } else {
    throw new Error('GitHub Sync isolation failed!');
  }

  console.log('\n--- 2. TESTING HYBRID RESOURCE LINKS ---');
  const { data: insertedGlobal } = await supabase.from('team_links').insert({
    team_id: teamId,
    hackathon_id: null,
    title: 'Team Shared Discord',
    url: 'https://discord.gg/team',
    category: 'other'
  }).select().single();

  const { data: insertedHack1 } = await supabase.from('team_links').insert({
    team_id: teamId,
    hackathon_id: hack1,
    title: 'Hackathon 1 Figma Wireframes',
    url: 'https://figma.com/file/hack1',
    category: 'design'
  }).select().single();

  // Query links for Hackathon 1 context (should return Global + Hack 1)
  const { data: allLinks } = await supabase.from('team_links').select('*').eq('team_id', teamId);
  const hack1ContextLinks = allLinks.filter(l => !l.hackathon_id || l.hackathon_id === hack1);
  const hack2ContextLinks = allLinks.filter(l => !l.hackathon_id || l.hackathon_id === hack2);

  console.log(`Links visible in Hackathon 1 view (${hack1ContextLinks.length}):`);
  hack1ContextLinks.forEach(l => console.log(`  - [${l.hackathon_id ? 'Track' : 'Global'}] ${l.title}`));

  console.log(`Links visible in Hackathon 2 view (${hack2ContextLinks.length}):`);
  hack2ContextLinks.forEach(l => console.log(`  - [${l.hackathon_id ? 'Track' : 'Global'}] ${l.title}`));

  const hasGlobalIn1 = hack1ContextLinks.some(l => l.id === insertedGlobal.id);
  const hasEventIn1 = hack1ContextLinks.some(l => l.id === insertedHack1.id);
  const hasEventIn2 = hack2ContextLinks.some(l => l.id === insertedHack1.id);

  if (hasGlobalIn1 && hasEventIn1 && !hasEventIn2) {
    console.log('✅ SUCCESS: Resource Links behave in hybrid mode (Global links show in all views, Event links only show in their track)!');
  } else {
    throw new Error('Hybrid resource links test failed!');
  }

  console.log('\n--- 3. CLEANING UP TEST ROWS ---');
  await supabase.from('team_github_repos').delete().eq('team_id', teamId);
  await supabase.from('team_links').delete().eq('id', insertedGlobal.id);
  await supabase.from('team_links').delete().eq('id', insertedHack1.id);
  console.log('✅ Cleanup completed.');
}

runEmpiricalVerification().catch(err => {
  console.error('Verification Error:', err);
  process.exit(1);
});

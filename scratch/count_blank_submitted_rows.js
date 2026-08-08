const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const adminClient = createClient(url, serviceKey);

async function countBlankSubmissions() {
  console.log('=== PLATFORM-WIDE BLANK SUBMISSIONS AUDIT ===');

  const { data: allSubs, error } = await adminClient
    .from('team_submissions')
    .select('team_id, hackathon_id, project_title, demo_url, github_url, pitch_video_url, completion_status');

  if (error) {
    console.error('Error fetching submissions:', error);
    return;
  }

  console.log(`Total team_submissions rows in DB: ${allSubs.length}`);

  const submittedRows = allSubs.filter(s => ['submitted', 'completed'].includes(s.completion_status));
  console.log(`Total rows with completion_status IN ('submitted', 'completed'): ${submittedRows.length}`);

  const blankSubmittedRows = submittedRows.filter(s => {
    const hasTitle = (s.project_title || '').trim().length > 0;
    const hasDemo = (s.demo_url || '').trim().length > 0;
    const hasGithub = (s.github_url || '').trim().length > 0;
    const hasPitch = (s.pitch_video_url || '').trim().length > 0;
    return !hasTitle && !hasDemo && !hasGithub && !hasPitch;
  });

  console.log(`\n🚨 BLANK ROWS MARKED AS 'submitted' / 'completed': ${blankSubmittedRows.length}`);
  console.log('Blank Rows Details:', blankSubmittedRows);
}

countBlankSubmissions();

const fs = require('fs');
const path = require('path');

async function testTrackRecordFeature() {
  console.log('=== TESTING BUILDER TRACK RECORD API & SECURITY ===');

  try {
    const res = await fetch('http://localhost:3000/api/builder-track-record/99e1c41d-1794-4f4d-87f6-4018a3a754d2');
    console.log('API HTTP Status:', res.status);
    const json = await res.json();

    console.log('\n--- API RESPONSE SUCCESS ---');
    console.log('Success:', json.success);

    if (json.data) {
      console.log('\n--- PROFILE (SANITY CHECK) ---');
      console.log('Full Name:', json.data.profile?.full_name);
      console.log('Email in response:', json.data.profile?.email || 'NULL (PROTECTED ✅)');
      console.log('Registrations Count:', json.data.registrations?.length);
      console.log('Teams Count:', json.data.teams?.length);
      console.log('Submissions Count:', json.data.submissions?.length);

      if (json.data.registrations?.length > 0) {
        console.log('\nSample Registration:', json.data.registrations[0].hackathon_name);
      }
    }
  } catch (err) {
    console.error('Test error:', err.message);
  }
}

testTrackRecordFeature();

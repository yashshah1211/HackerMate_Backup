/* eslint-disable */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    env[key] = value;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'https://rhryjrbebfrrfhtyyzbs.supabase.co';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function run() {
  const email = 'devuser@hackermate.com';
  const password = 'Password123!';

  console.log(`Checking if user ${email} already exists...`);
  
  // List users or find by email
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError);
    return;
  }

  let devUser = users.find(u => u.email === email);

  if (devUser) {
    console.log('Dev user already exists, resetting password...');
    const { data: user, error: updateError } = await supabase.auth.admin.updateUserById(
      devUser.id,
      { password: password }
    );
    if (updateError) {
      console.error('Error updating user password:', updateError);
      return;
    }
    console.log('Password reset successfully.');
  } else {
    console.log('Creating new dev user...');
    const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createError) {
      console.error('Error creating user:', createError);
      return;
    }
    devUser = user;
    console.log('Dev user created successfully with ID:', devUser.id);
  }

  // Check profiles row
  console.log('Checking profiles row for dev user...');
  const { data: profile, error: pError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', devUser.id)
    .single();

  if (pError && pError.code !== 'PGRST116') {
    console.error('Error fetching profile:', pError);
    return;
  }

  if (!profile) {
    console.log('No profile row found. Wait for trigger or create one...');
    // The handle_new_user trigger should have created it, but let's make sure
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: devUser.id,
        email: email,
        full_name: 'Dev User',
        onboarding_completed: true,
        skills: ['React', 'Next.js', 'TailwindCSS', 'TypeScript', 'Node.js'],
        college: 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)'
      });
    if (insertError) {
      console.error('Error creating profile:', insertError);
      return;
    }
    console.log('Profile created and onboarding completed.');
  } else {
    console.log('Profile row found, updating onboarding status...');
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: 'Dev User',
        onboarding_completed: true,
        skills: ['React', 'Next.js', 'TailwindCSS', 'TypeScript', 'Node.js'],
        college: 'DJSCE Mumbai (Dwarkadas J. Sanghvi College of Engineering)'
      })
      .eq('id', devUser.id);
    if (updateError) {
      console.error('Error updating profile:', updateError);
      return;
    }
    console.log('Profile updated and onboarding completed.');
  }

  console.log('Dev user setup complete!');
}

run();

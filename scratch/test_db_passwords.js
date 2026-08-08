const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const projectRef = 'rhryjrbebfrrfhtyyzbs';

// Common password environment variables
const potentialPasswords = [
  process.env.DATABASE_URL,
  process.env.SUPABASE_DB_URL,
  process.env.POSTGRES_PASSWORD,
  process.env.SUPABASE_DB_PASSWORD
].filter(Boolean);

console.log('Found potential env connection strings/passwords:', potentialPasswords.length);

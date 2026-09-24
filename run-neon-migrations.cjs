// run-neon-migrations.cjs
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const CONN = 'postgresql://neondb_owner:npg_ubdfnQDRK45v@ep-late-mode-b4frtqbz-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function main() {
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅ Connected to Neon DB');

  const sql = fs.readFileSync(path.join(__dirname, 'neon-setup.sql'), 'utf8');
  console.log('Running migrations...');
  try {
    await client.query(sql);
    console.log('✅ All migrations applied successfully!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    console.error('Detail:', err.detail || '');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

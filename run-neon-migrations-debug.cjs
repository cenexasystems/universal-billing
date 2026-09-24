// run-neon-migrations-debug.cjs - runs SQL statement by statement to find errors
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const CONN = 'postgresql://neondb_owner:npg_ubdfnQDRK45v@ep-late-mode-b4frtqbz-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

function splitStatements(sql) {
  // Split on semicolons that are NOT inside $$ quotes or string literals
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let i = 0;
  
  while (i < sql.length) {
    const ch = sql[i];
    const twoChar = sql.slice(i, i + 2);
    
    // Toggle dollar quote on $$
    if (twoChar === '$$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i += 2;
      continue;
    }
    
    // If we hit a semicolon outside quotes, that's a statement end
    if (ch === ';' && !inDollarQuote) {
      current += ';';
      const trimmed = current.trim();
      // Skip pure comment blocks and empty statements
      if (trimmed && !trimmed.match(/^(--.*)$/s)) {
        statements.push(trimmed);
      }
      current = '';
      i++;
      continue;
    }
    
    current += ch;
    i++;
  }
  
  // Any remainder
  if (current.trim()) statements.push(current.trim());
  
  return statements;
}

async function main() {
  const client = new Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅ Connected to Neon DB');

  const sql = fs.readFileSync(path.join(__dirname, 'neon-setup.sql'), 'utf8');
  const statements = splitStatements(sql);
  
  console.log(`Found ${statements.length} statements to execute`);
  
  let successCount = 0;
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    // Skip pure comment-only statements
    const nonCommentContent = stmt.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!nonCommentContent || nonCommentContent === ';') {
      continue;
    }
    
    try {
      await client.query(stmt);
      successCount++;
    } catch (err) {
      console.error(`\n❌ FAILED at statement #${i + 1}:`);
      console.error('Error:', err.message);
      console.error('Statement preview:', stmt.slice(0, 300));
      await client.end();
      process.exit(1);
    }
  }
  
  console.log(`\n✅ All ${successCount} statements executed successfully!`);
  await client.end();
}

main();

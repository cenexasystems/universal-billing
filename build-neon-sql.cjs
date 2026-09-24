// build-neon-sql.cjs  v2
// Reads all 19 Supabase migration files, strips Supabase-specific constructs,
// and writes a single neon-setup.sql safe for vanilla Postgres (Neon).

const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, 'supabase', 'migrations');

const migrationFiles = [
  '20260716_0001_purple_boutique_schema.sql',
  '20260716_0002_purple_boutique_catalog.sql',
  '20260716_0003_order_rpc_compatibility.sql',
  '20260719_0004_advance_orders.sql',
  '20260722_0005_eight_digit_invoice_numbers.sql',
  '20260724_0006_fix_complete_advance_order.sql',
  '20260724_0008_fix_public_invoice_rpc.sql',
  '20260724_0009_create_invoices_bucket.sql',
  '20260726_0007_update_complete_advance_order_discount.sql',
  '20260728_0010_final_audit_fixes.sql',
  '20260808_0011_billing_date_and_order_fields.sql',
  '20260901_0012_inventory_barcode_addon.sql',
  '20260903_0013_expense_tracker_addon.sql',
  '20260904_0015_unregistered_category.sql',
  '20260911_0016_rebrand_to_chaji_mens_wear.sql',
  '20260912_0017_update_store_address.sql',
  '20260917_0001_fix_soft_delete_unique_constraints.sql',
  '20260918_0018_advance_order_self_heal.sql',
  '20260918_0019_robust_public_invoice_lookup.sql',
];

function stripSupabaseSpecific(sql) {
  const lines = sql.split('\n');
  const result = [];
  let skipUntilSemicolon = false;
  let dollarQuoteDepth = 0; // Track if inside $$...$$ function body

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const rawLine = line;

    // Count $$ markers to know if we're inside a function body
    const dollarMarkers = (line.match(/\$\$/g) || []).length;
    // Even count = same state, Odd count = toggled
    if (dollarMarkers % 2 !== 0) {
      dollarQuoteDepth = dollarQuoteDepth === 0 ? 1 : 0;
    }

    // === If we're draining a skip-block ===
    if (skipUntilSemicolon) {
      if (line.trim().endsWith(';')) skipUntilSemicolon = false;
      result.push('-- [NEON-SKIP] ' + line);
      continue;
    }

    // === TOP-LEVEL (not inside $$) skips ===
    if (dollarQuoteDepth === 0) {
      // storage.buckets INSERT
      if (/INSERT INTO storage\.buckets/i.test(line)) {
        result.push('-- [NEON] Skipped: storage.buckets insert');
        skipUntilSemicolon = !line.trim().endsWith(';');
        continue;
      }
      // storage.objects policies
      if (/(?:DROP|CREATE)\s+POLICY.*ON\s+storage\.objects/i.test(line)) {
        result.push('-- [NEON] Skipped: storage policy');
        skipUntilSemicolon = !line.trim().endsWith(';');
        continue;
      }
      // supabase_realtime DO $$ blocks
      if (/ALTER PUBLICATION supabase_realtime/i.test(line)) {
        result.push('-- [NEON] Skipped: supabase_realtime');
        skipUntilSemicolon = !line.trim().endsWith(';');
        continue;
      }
      // GRANT / REVOKE
      if (/GRANT\s+.*\s+TO\s+(?:anon|authenticated)/i.test(line) ||
          /REVOKE\s+ALL\s+.*\s+FROM\s+PUBLIC/i.test(line)) {
        result.push('-- [NEON] Skipped: ' + line.trim());
        continue;
      }
      // RLS
      if (/ALTER TABLE.*ENABLE ROW LEVEL SECURITY/i.test(line)) {
        result.push('-- [NEON] Skipped: ' + line.trim());
        continue;
      }
      // Policies
      if (/^\s*(?:DROP|CREATE)\s+POLICY\s+/i.test(line)) {
        result.push('-- [NEON] Skipped: Policy');
        skipUntilSemicolon = !line.trim().endsWith(';');
        continue;
      }
      // auth.users triggers (top-level)
      if (/ON\s+auth\.users/i.test(line) && /(?:CREATE|DROP)\s+TRIGGER/i.test(line)) {
        result.push('-- [NEON] Skipped: auth.users trigger');
        continue;
      }
    }

    // === INSIDE FUNCTION BODY (or anywhere) ===
    // Skip UPDATE auth.users ... block (skip until semicolon)
    if (/^\s*UPDATE\s+auth\.users/i.test(line)) {
      result.push('-- [NEON] Skipped: UPDATE auth.users block');
      skipUntilSemicolon = !line.trim().endsWith(';');
      continue;
    }
    // Skip SET raw_app_meta_data lines
    if (/raw_app_meta_data/i.test(line)) {
      result.push('-- [NEON] Skipped: raw_app_meta_data: ' + line.trim());
      continue;
    }
    // Skip raw_user_meta_data lines
    if (/raw_user_meta_data/i.test(line)) {
      result.push('-- [NEON] Skipped: raw_user_meta_data: ' + line.trim());
      continue;
    }

    // === INLINE REPLACEMENTS ===
    line = line
      // Remove FK to auth.users
      .replace(/\s*REFERENCES\s+auth\.users\(id\)\s+ON\s+DELETE\s+(?:CASCADE|SET\s+NULL)/gi, '')
      .replace(/\s*REFERENCES\s+auth\.users\(id\)/gi, '')
      // Replace auth.uid()
      .replace(/\bauth\.uid\(\)/gi, 'NULL::UUID')
      // Replace auth.jwt() calls
      .replace(/auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'role'/gi, "''")
      .replace(/\bauth\.jwt\(\)/gi, "'{}'::jsonb");

    result.push(line);
  }

  return result.join('\n');
}

let combined = `-- ==========================================================
-- Universal Look POS — Neon DB Combined Schema & Migrations
-- Generated by build-neon-sql.cjs v2
-- Supabase-specific constructs (auth.*, storage.*, RLS) stripped.
-- ==========================================================

SET client_min_messages TO WARNING;

`;

for (const file of migrationFiles) {
  const filePath = path.join(migrationsDir, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${file} not found, skipping`);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const stripped = stripSupabaseSpecific(content);
  combined += `\n-- ============================================================\n`;
  combined += `-- Migration: ${file}\n`;
  combined += `-- ============================================================\n`;
  combined += stripped + '\n';
  console.log(`Processed: ${file}`);
}

// Override final store_settings with Universal Look brand
combined += `
-- ============================================================
-- Final: Set Universal Look store settings
-- ============================================================
INSERT INTO public.store_settings (id, name, owner_name, phone, email, address)
VALUES (1, 'Universal Look', '', '+91 91596 00067', 'universallook600067@gmail.com', '1/46 GNT Road, Sholavaram, Chennai - 600067')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  owner_name = EXCLUDED.owner_name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  address = EXCLUDED.address,
  updated_at = NOW();
`;

fs.writeFileSync(path.join(__dirname, 'neon-setup.sql'), combined);
console.log('\n✅ neon-setup.sql created successfully!');

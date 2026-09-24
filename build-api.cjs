// build-api.cjs
// Scaffolds the Vercel API routes and the neon-client wrapper

const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, 'api');
if (!fs.existsSync(apiDir)) fs.mkdirSync(apiDir);

const files = {
  '_db.js': `
import { neon } from '@neondatabase/serverless';
// Neon client that works in Edge/Serverless environments
const sql = neon(process.env.DATABASE_URL);
export default sql;
`,
  'auth.js': `
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, password } = req.body || {};
  
  const adminId = process.env.VITE_ADMIN_ID || 'admin';
  const adminPwd = process.env.VITE_ADMIN_PASSWORD || 'admin123';
  const staffId = process.env.VITE_STAFF_ID || 'staff';
  const staffPwd = process.env.VITE_STAFF_PASSWORD || 'staff123';

  if (id === adminId && password === adminPwd) {
    return res.status(200).json({ role: 'admin', name: 'Admin', id: adminId });
  }
  if (id === staffId && password === staffPwd) {
    return res.status(200).json({ role: 'staff', name: 'Staff', id: staffId });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
}
`,
  'products.js': `
import sql from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const rows = await sql\`SELECT * FROM public.products ORDER BY sort_order, name\`;
      return res.status(200).json(rows);
    }
    
    if (req.method === 'POST') {
      const b = req.body;
      const [row] = await sql\`
        INSERT INTO public.products (
          name, name_ta, category, category_id, price, offer_price, 
          purchase_price, stock_quantity, stock, low_stock_alert, 
          unit, unit_type, description, description_ta, benefits, 
          benefits_ta, image_url, sku, barcode, has_variants, 
          is_active, sort_order
        ) VALUES (
          \${b.name}, \${b.name_ta||''}, \${b.category||''}, \${b.category_id||null}, 
          \${b.price||0}, \${b.offer_price||null}, \${b.purchase_price||0}, 
          \${b.stock_quantity||0}, \${b.stock||0}, \${b.low_stock_alert||5}, 
          \${b.unit||'piece'}, \${b.unit_type||'unit'}, \${b.description||''}, 
          \${b.description_ta||''}, \${b.benefits||''}, \${b.benefits_ta||''}, 
          \${b.image_url||null}, \${b.sku||null}, \${b.barcode||null}, 
          \${b.has_variants||false}, \${b.is_active!==false}, \${b.sort_order||0}
        ) RETURNING *\`;
      return res.status(201).json(row);
    }
    
    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      
      const keys = Object.keys(updates);
      if (keys.length === 0) return res.status(200).json({ id });
      
      // Dynamic update with Postgres
      const sets = keys.map((k, i) => \`\${k} = $\${i+2}\`).join(', ');
      const values = Object.values(updates);
      const rows = await sql.unsafe(
        \`UPDATE public.products SET \${sets}, updated_at = NOW() WHERE id = $1 RETURNING *\`, 
        [id, ...values]
      );
      return res.status(200).json(rows[0]);
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql\`UPDATE public.products SET is_active = false, updated_at = NOW() WHERE id = \${id}\`;
      return res.status(200).json({ success: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
`,
  'rpc.js': `
import sql from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const fn = req.query.fn;
  const args = req.body || {};

  try {
    if (fn === 'complete_pos_sale_with_inventory') {
      const [result] = await sql\`
        SELECT public.complete_pos_sale_with_inventory(
          \${args.p_customer_name||'Customer'},
          \${args.p_phone||''},
          \${args.p_address||''},
          \${JSON.stringify(args.p_items||[])}::jsonb,
          \${args.p_shipping||0},
          \${args.p_status||'completed'},
          \${args.p_order_mode||'offline'},
          \${args.p_order_type||'pos_sale'},
          \${args.p_delivery_charge||0},
          \${args.p_discount_amount||0},
          \${args.p_manual_discount_amount||0},
          \${args.p_manual_discount_type||'flat'},
          \${args.p_manual_discount_value||0},
          \${args.p_coupon_code||null},
          \${args.p_coupon_percentage||0},
          \${args.p_payment_method||'cash'},
          \${JSON.stringify(args.p_split_details||{})}::jsonb,
          \${args.p_total_gst||0},
          \${args.p_gst_enabled||false},
          \${args.p_remarks||null},
          \${args.p_reference_number||null},
          \${args.p_billing_date||null}
        ) as data
      \`;
      return res.status(200).json(result.data);
    }
    
    if (fn === 'create_order_with_stock') {
       // Similar wrapper... fallback for backward compatibility
       const [result] = await sql\`
        SELECT public.create_order_with_stock(
          \${args.p_customer_name||'Customer'},
          \${args.p_phone||''},
          \${args.p_address||''},
          \${JSON.stringify(args.p_items||[])}::jsonb,
          \${args.p_shipping||0},
          \${args.p_status||'completed'},
          \${args.p_order_mode||'offline'},
          \${args.p_order_type||'pos_sale'},
          \${args.p_delivery_charge||0},
          \${args.p_discount_amount||0},
          \${args.p_manual_discount_amount||0},
          \${args.p_manual_discount_type||'flat'},
          \${args.p_manual_discount_value||0},
          \${args.p_coupon_code||null},
          \${args.p_coupon_percentage||0},
          \${args.p_total_gst||0},
          \${args.p_gst_enabled||false},
          \${args.p_payment_method||'cash'},
          \${JSON.stringify(args.p_split_details||{})}::jsonb
        ) as data
      \`;
      return res.status(200).json(result.data);
    }

    if (fn === 'adjust_inventory_stock') {
      const [result] = await sql\`
        SELECT public.adjust_inventory_stock(
          \${args.p_product_id},
          \${args.p_variant_id||null},
          \${args.p_new_quantity||0},
          \${args.p_reason||'RESTOCK'},
          \${args.p_note||''},
          \${args.p_created_by_name||''}
        ) as data
      \`;
      return res.status(200).json(result.data);
    }

    return res.status(404).json({ error: 'RPC function not mapped: ' + fn });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
`,
  'query.js': `
import sql from './_db.js';

// Generic table query handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const table = req.query.table;
  if (!table || !/^[a-z0-9_]+$/.test(table)) {
    return res.status(400).json({ error: 'Invalid table name' });
  }

  try {
    if (req.method === 'GET') {
      // Very simple filter support: eq, order, limit
      let queryStr = \`SELECT * FROM public.\${table} WHERE 1=1\`;
      const values = [];
      let i = 1;

      for (const [key, val] of Object.entries(req.query)) {
        if (key === 'table' || key === 'order' || key === 'limit') continue;
        
        if (val.startsWith('eq.')) {
          queryStr += \` AND \${key} = $\${i++}\`;
          values.push(val.slice(3));
        } else if (val.startsWith('neq.')) {
          queryStr += \` AND \${key} != $\${i++}\`;
          values.push(val.slice(4));
        } else {
          queryStr += \` AND \${key} = $\${i++}\`;
          values.push(val);
        }
      }

      if (req.query.order) {
        const parts = req.query.order.split('.'); // e.g. "created_at.desc"
        const col = parts[0];
        const dir = parts[1] === 'desc' ? 'DESC' : 'ASC';
        if (/^[a-z0-9_]+$/.test(col)) {
          queryStr += \` ORDER BY \${col} \${dir}\`;
        }
      }

      if (req.query.limit) {
        const num = parseInt(req.query.limit, 10);
        if (!isNaN(num)) queryStr += \` LIMIT \${num}\`;
      }

      const rows = await sql.unsafe(queryStr, values);
      return res.status(200).json(rows);
    }
    
    if (req.method === 'POST') {
      const b = req.body;
      const keys = Object.keys(b);
      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => \`$\${i+1}\`).join(', ');
      const values = Object.values(b);
      
      const rows = await sql.unsafe(
        \`INSERT INTO public.\${table} (\${cols}) VALUES (\${placeholders}) RETURNING *\`, 
        values
      );
      return res.status(201).json(rows[0]);
    }
    
    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;
      const keys = Object.keys(updates);
      const sets = keys.map((k, i) => \`\${k} = $\${i+2}\`).join(', ');
      const values = Object.values(updates);
      
      const rows = await sql.unsafe(
        \`UPDATE public.\${table} SET \${sets}, updated_at = NOW() WHERE id = $1 RETURNING *\`, 
        [id, ...values]
      );
      return res.status(200).json(rows[0]);
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body;
      
      // Some tables use soft delete (is_active)
      if (['categories', 'product_variants', 'coupons', 'barcode_registry'].includes(table)) {
        await sql.unsafe(\`UPDATE public.\${table} SET is_active = false, updated_at = NOW() WHERE id = $1\`, [id]);
      } else {
        await sql.unsafe(\`DELETE FROM public.\${table} WHERE id = $1\`, [id]);
      }
      return res.status(200).json({ success: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
`
};

for (const [filename, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(apiDir, filename), content.trim());
}
console.log('✅ Vercel API routes scaffolded in /api/');

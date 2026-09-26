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
      let queryStr = `SELECT * FROM public.${table} WHERE 1=1`;
      const values = [];
      let i = 1;

      for (const [key, val] of Object.entries(req.query)) {
        if (key === 'table' || key === 'order' || key === 'limit') continue;

        if (key === 'or') {
          // val: "col1.ilike.%A%,col2.in.(1,2)"
          const conds = val.split(',');
          const orClauses = [];
          for (const cond of conds) {
            const firstDot = cond.indexOf('.');
            const secondDot = cond.indexOf('.', firstDot + 1);
            if (firstDot > 0 && secondDot > firstDot) {
              const cCol = cond.substring(0, firstDot);
              const cOp = cond.substring(firstDot + 1, secondDot);
              const cVal = cond.substring(secondDot + 1);
              if (cOp === 'ilike') {
                orClauses.push(`${cCol} ILIKE $${i++}`);
                values.push(cVal);
              } else if (cOp === 'in') {
                const inStr = cVal.startsWith('(') ? cVal.slice(1, -1) : cVal;
                const inArr = inStr.split(',').map(s => s.replace(/^"|"$/g, ''));
                const inPlaceholders = inArr.map(() => `$${i++}`).join(',');
                orClauses.push(`${cCol} IN (${inPlaceholders})`);
                values.push(...inArr);
              } else if (cOp === 'eq') {
                orClauses.push(`${cCol} = $${i++}`);
                values.push(cVal);
              }
            }
          }
          if (orClauses.length > 0) {
            queryStr += ` AND (${orClauses.join(' OR ')})`;
          }
          continue;
        }
        
        if (typeof val !== 'string') continue;

        if (val.startsWith('eq.')) {
          queryStr += ` AND ${key} = $${i++}`;
          values.push(val.slice(3));
        } else if (val.startsWith('neq.')) {
          queryStr += ` AND ${key} != $${i++}`;
          values.push(val.slice(4));
        } else if (val.startsWith('ilike.')) {
          queryStr += ` AND ${key} ILIKE $${i++}`;
          values.push(val.slice(6));
        } else if (val.startsWith('in.')) {
          const inStr = val.slice(3);
          const cleanStr = inStr.startsWith('(') ? inStr.slice(1, -1) : inStr;
          const inArr = cleanStr.split(',').map(s => s.replace(/^"|"$/g, ''));
          const inPlaceholders = inArr.map(() => `$${i++}`).join(',');
          queryStr += ` AND ${key} IN (${inPlaceholders})`;
          values.push(...inArr);
        } else {
          queryStr += ` AND ${key} = $${i++}`;
          values.push(val);
        }
      }

      if (req.query.order) {
        const parts = req.query.order.split('.'); // e.g. "created_at.desc"
        const col = parts[0];
        const dir = parts[1] === 'desc' ? 'DESC' : 'ASC';
        if (/^[a-z0-9_]+$/.test(col)) {
          queryStr += ` ORDER BY ${col} ${dir}`;
        }
      }

      if (req.query.limit) {
        const num = parseInt(req.query.limit, 10);
        if (!isNaN(num)) queryStr += ` LIMIT ${num}`;
      }

      const rows = await sql.unsafe(queryStr, values);
      return res.status(200).json(rows);
    }
    
    if (req.method === 'POST') {
      const b = req.body;
      const keys = Object.keys(b);
      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i+1}`).join(', ');
      const values = Object.values(b);
      
      const rows = await sql.unsafe(
        `INSERT INTO public.${table} (${cols}) VALUES (${placeholders}) RETURNING *`, 
        values
      );
      return res.status(201).json(rows[0]);
    }
    
    if (req.method === 'PATCH') {
      const { id, ...rawUpdates } = req.body;

      // Generated/computed columns that must never be written to directly
      const GENERATED_COLS = new Set(['remaining_balance']);
      const updates = Object.fromEntries(
        Object.entries(rawUpdates).filter(([k]) => !GENERATED_COLS.has(k))
      );

      if (Object.keys(updates).length === 0) {
        return res.status(200).json({ id });
      }

      const keys = Object.keys(updates);
      const sets = keys.map((k, i) => `${k} = $${i+2}`).join(', ');
      const values = Object.values(updates);
      
      const rows = await sql.unsafe(
        `UPDATE public.${table} SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`, 
        [id, ...values]
      );
      return res.status(200).json(rows[0]);
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body;
      
      // Some tables use soft delete (is_active)
      if (['products', 'categories', 'product_variants', 'coupons', 'barcode_registry'].includes(table)) {
        await sql.unsafe(`UPDATE public.${table} SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
      } else {
        await sql.unsafe(`DELETE FROM public.${table} WHERE id = $1`, [id]);
      }
      return res.status(200).json({ success: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
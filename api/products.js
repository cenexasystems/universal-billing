import sql from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM public.products ORDER BY sort_order, name`;
      return res.status(200).json(rows);
    }
    
    if (req.method === 'POST') {
      const b = req.body;
      const [row] = await sql`
        INSERT INTO public.products (
          name, name_ta, category, category_id, price, offer_price, 
          purchase_price, stock_quantity, stock, low_stock_alert, 
          unit, unit_type, description, description_ta, benefits, 
          benefits_ta, image_url, sku, barcode, has_variants, 
          is_active, sort_order
        ) VALUES (
          ${b.name}, ${b.name_ta||''}, ${b.category||''}, ${b.category_id||null}, 
          ${b.price||0}, ${b.offer_price||null}, ${b.purchase_price||0}, 
          ${b.stock_quantity||0}, ${b.stock||0}, ${b.low_stock_alert||5}, 
          ${b.unit||'piece'}, ${b.unit_type||'unit'}, ${b.description||''}, 
          ${b.description_ta||''}, ${b.benefits||''}, ${b.benefits_ta||''}, 
          ${b.image_url||null}, ${b.sku||null}, ${b.barcode||null}, 
          ${b.has_variants||false}, ${b.is_active!==false}, ${b.sort_order||0}
        ) RETURNING *`;
      return res.status(201).json(row);
    }
    
    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      
      const keys = Object.keys(updates);
      if (keys.length === 0) return res.status(200).json({ id });
      
      // Dynamic update with Postgres
      const sets = keys.map((k, i) => `${k} = $${i+2}`).join(', ');
      const values = Object.values(updates);
      const rows = await sql.unsafe(
        `UPDATE public.products SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`, 
        [id, ...values]
      );
      return res.status(200).json(rows[0]);
    }
    
    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql`UPDATE public.products SET is_active = false, updated_at = NOW() WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
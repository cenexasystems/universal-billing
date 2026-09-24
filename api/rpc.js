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
      const [result] = await sql`
        SELECT public.complete_pos_sale_with_inventory(
          ${args.p_customer_name||'Customer'},
          ${args.p_phone||''},
          ${args.p_address||''},
          ${JSON.stringify(args.p_items||[])}::jsonb,
          ${args.p_shipping||0},
          ${args.p_status||'completed'},
          ${args.p_order_mode||'offline'},
          ${args.p_order_type||'pos_sale'},
          ${args.p_delivery_charge||0},
          ${args.p_discount_amount||0},
          ${args.p_manual_discount_amount||0},
          ${args.p_manual_discount_type||'flat'},
          ${args.p_manual_discount_value||0},
          ${args.p_coupon_code||null},
          ${args.p_coupon_percentage||0},
          ${args.p_payment_method||'cash'},
          ${JSON.stringify(args.p_split_details||{})}::jsonb,
          ${args.p_total_gst||0},
          ${args.p_gst_enabled||false},
          ${args.p_remarks||null},
          ${args.p_reference_number||null},
          ${args.p_billing_date||null}
        ) as data
      `;
      return res.status(200).json(result.data);
    }
    
    if (fn === 'create_order_with_stock') {
       // Similar wrapper... fallback for backward compatibility
       const [result] = await sql`
        SELECT public.create_order_with_stock(
          ${args.p_customer_name||'Customer'},
          ${args.p_phone||''},
          ${args.p_address||''},
          ${JSON.stringify(args.p_items||[])}::jsonb,
          ${args.p_shipping||0},
          ${args.p_status||'completed'},
          ${args.p_order_mode||'offline'},
          ${args.p_order_type||'pos_sale'},
          ${args.p_delivery_charge||0},
          ${args.p_discount_amount||0},
          ${args.p_manual_discount_amount||0},
          ${args.p_manual_discount_type||'flat'},
          ${args.p_manual_discount_value||0},
          ${args.p_coupon_code||null},
          ${args.p_coupon_percentage||0},
          ${args.p_total_gst||0},
          ${args.p_gst_enabled||false},
          ${args.p_payment_method||'cash'},
          ${JSON.stringify(args.p_split_details||{})}::jsonb
        ) as data
      `;
      return res.status(200).json(result.data);
    }

    if (fn === 'adjust_inventory_stock') {
      const [result] = await sql`
        SELECT public.adjust_inventory_stock(
          ${args.p_product_id},
          ${args.p_variant_id||null},
          ${args.p_new_quantity||0},
          ${args.p_reason||'RESTOCK'},
          ${args.p_note||''},
          ${args.p_created_by_name||''}
        ) as data
      `;
      return res.status(200).json(result.data);
    }

    return res.status(404).json({ error: 'RPC function not mapped: ' + fn });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
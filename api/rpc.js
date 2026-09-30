import sql from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const fn = req.query.fn;
  const args = req.body || {};

  try {
    if (fn === 'fix_rpc') {
      await sql.unsafe(`DROP FUNCTION IF EXISTS public.complete_pos_sale_with_inventory(text,text,text,jsonb,numeric,text,text,text,numeric,numeric,numeric,text,numeric,text,numeric,text,jsonb,numeric,boolean,text,text,timestamp with time zone)`);
      await sql.unsafe(`
CREATE OR REPLACE FUNCTION public.complete_pos_sale_with_inventory(
  p_customer_name text,
  p_phone text,
  p_address text,
  p_items jsonb,
  p_shipping numeric,
  p_status text,
  p_order_mode text,
  p_order_type text,
  p_delivery_charge numeric,
  p_discount_amount numeric,
  p_manual_discount_amount numeric,
  p_manual_discount_type text,
  p_manual_discount_value numeric,
  p_coupon_code text,
  p_coupon_percentage numeric,
  p_payment_method text,
  p_split_details jsonb,
  p_total_gst numeric,
  p_gst_enabled boolean,
  p_remarks text,
  p_reference_number text,
  p_billing_date timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_no text;
  v_order_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_user_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_line_total numeric;
  
  v_product_id bigint;
  v_variant_id uuid;
  v_is_manual boolean;
  v_product_name text;
  v_name_ta text;
  v_unit text;
  v_unit_type text;
  v_base_quantity numeric;
  v_discount numeric;
  v_gst_amount numeric;
  v_gst_rate numeric;
  v_image_url text;
  v_variant_name text;
  v_source text;
  v_note text;
  v_category text;
  v_current_stock numeric;
  v_barcode_id uuid;
  v_created_at timestamp with time zone := COALESCE(p_billing_date, NOW());
BEGIN
  v_invoice_no := public.get_next_invoice_no();

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := COALESCE((v_item ->> 'quantity')::NUMERIC, 0);
    v_unit_price := COALESCE((v_item ->> 'unit_price')::NUMERIC, (v_item ->> 'base_price')::NUMERIC, (v_item ->> 'price')::NUMERIC, 0);
    v_line_total := COALESCE((v_item ->> 'line_total')::NUMERIC, ROUND(v_quantity * v_unit_price, 2));
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  v_total := GREATEST(0, ROUND(v_subtotal + COALESCE(p_shipping, 0) + COALESCE(p_delivery_charge, 0) - COALESCE(p_discount_amount, 0), 2));

  INSERT INTO public.orders (
    invoice_no, user_id, customer_name, phone, address, items,
    subtotal, shipping, total, status, order_mode, order_type,
    delivery_charge, discount_amount, manual_discount_amount,
    manual_discount_type, manual_discount_value, coupon_code,
    coupon_percentage, total_gst, gst_amount, gst_enabled,
    payment_method, payment_mode, split_details, remarks,
    reference_number, billing_date, created_at, updated_at
  )
  VALUES (
    v_invoice_no, v_user_id, COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'Customer'),
    COALESCE(p_phone, ''), COALESCE(p_address, ''), p_items,
    v_subtotal, COALESCE(p_shipping, 0), v_total, COALESCE(p_status, 'completed'),
    COALESCE(p_order_mode, 'offline'), COALESCE(p_order_type, 'pos_sale'),
    COALESCE(p_delivery_charge, 0), COALESCE(p_discount_amount, 0),
    COALESCE(p_manual_discount_amount, 0), COALESCE(p_manual_discount_type, 'flat'),
    COALESCE(p_manual_discount_value, 0), p_coupon_code,
    COALESCE(p_coupon_percentage, 0), COALESCE(p_total_gst, 0),
    COALESCE(p_total_gst, 0), COALESCE(p_gst_enabled, FALSE),
    COALESCE(p_payment_method, 'cash'), COALESCE(p_payment_method, 'cash'),
    COALESCE(p_split_details, '{}'::JSONB), p_remarks,
    p_reference_number, p_billing_date, v_created_at, NOW()
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item ->> 'product_id', '')::BIGINT;
    v_variant_id := NULLIF(v_item ->> 'variant_id', '')::UUID;
    v_quantity := COALESCE((v_item ->> 'quantity')::NUMERIC, 0);
    v_unit_price := COALESCE((v_item ->> 'unit_price')::NUMERIC, (v_item ->> 'base_price')::NUMERIC, 0);
    v_line_total := COALESCE((v_item ->> 'line_total')::NUMERIC, ROUND(v_quantity * v_unit_price, 2));
    v_product_name := COALESCE(v_item ->> 'product_name', v_item ->> 'name', 'Product');
    v_name_ta := COALESCE(v_item ->> 'product_tamil_name', v_item ->> 'tamil_name', '');
    v_unit := COALESCE(v_item ->> 'unit', 'piece');
    v_unit_type := COALESCE(v_item ->> 'unit_type', 'unit');
    v_base_quantity := COALESCE((v_item ->> 'base_quantity')::NUMERIC, 1);
    v_is_manual := COALESCE((v_item ->> 'is_manual')::BOOLEAN, FALSE);
    v_discount := COALESCE((v_item ->> 'discount')::NUMERIC, 0);
    v_gst_amount := COALESCE((v_item ->> 'gst_amount')::NUMERIC, 0);
    v_gst_rate := COALESCE((v_item ->> 'gst_rate')::NUMERIC, 0);
    v_image_url := v_item ->> 'image_url';
    v_variant_name := v_item ->> 'variant_name';
    v_source := COALESCE(v_item ->> 'source', 'catalogue');
    v_note := v_item ->> 'note';
    v_category := v_item ->> 'category';

    INSERT INTO public.order_items (
      order_id, product_id, variant_id, product_name, name,
      product_tamil_name, tamil_name, quantity, unit, unit_type,
      base_quantity, base_price, unit_price, line_total, image_url,
      is_manual, discount, gst_amount, gst_rate, variant_name,
      source, note, category, created_at
    )
    VALUES (
      v_order_id, v_product_id, v_variant_id, v_product_name, v_product_name,
      v_name_ta, v_name_ta, v_quantity, v_unit, v_unit_type,
      v_base_quantity, v_unit_price, v_unit_price, v_line_total, v_image_url,
      v_is_manual, v_discount, v_gst_amount, v_gst_rate, v_variant_name,
      v_source, v_note, v_category, v_created_at
    );

    IF NOT v_is_manual AND v_quantity > 0 THEN
      IF v_variant_id IS NOT NULL THEN
        SELECT stock INTO v_current_stock FROM public.product_variants WHERE id = v_variant_id;
        SELECT id INTO v_barcode_id FROM public.barcode_registry WHERE variant_id = v_variant_id AND is_active = TRUE LIMIT 1;

        UPDATE public.product_variants
        SET stock = COALESCE(stock, 0) - v_quantity, updated_at = NOW()
        WHERE id = v_variant_id;

        UPDATE public.products
        SET stock_quantity = (SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_product_id AND is_active = TRUE),
            stock = FLOOR((SELECT COALESCE(SUM(stock), 0) FROM public.product_variants WHERE product_id = v_product_id AND is_active = TRUE))::INTEGER,
            updated_at = NOW()
        WHERE id = v_product_id;

        INSERT INTO public.inventory_movements (
          product_id, variant_id, barcode_id, movement_type,
          quantity_delta, quantity_before, quantity_after,
          reference_type, reference_id, note
        )
        VALUES (
          v_product_id, v_variant_id, v_barcode_id, 'SALE',
          -v_quantity, COALESCE(v_current_stock, 0), COALESCE(v_current_stock, 0) - v_quantity,
          'order', v_invoice_no, 'POS Sale checkout'
        );

      ELSIF v_product_id IS NOT NULL THEN
        SELECT stock_quantity INTO v_current_stock FROM public.products WHERE id = v_product_id;
        SELECT id INTO v_barcode_id FROM public.barcode_registry WHERE product_id = v_product_id AND variant_id IS NULL AND is_active = TRUE LIMIT 1;

        UPDATE public.products
        SET stock_quantity = COALESCE(stock_quantity, 0) - v_quantity,
            stock = COALESCE(stock, 0) - FLOOR(v_quantity)::INTEGER,
            updated_at = NOW()
        WHERE id = v_product_id;

        INSERT INTO public.inventory_movements (
          product_id, variant_id, barcode_id, movement_type,
          quantity_delta, quantity_before, quantity_after,
          reference_type, reference_id, note
        )
        VALUES (
          v_product_id, NULL, v_barcode_id, 'SALE',
          -v_quantity, COALESCE(v_current_stock, 0), COALESCE(v_current_stock, 0) - v_quantity,
          'order', v_invoice_no, 'POS Sale checkout'
        );
      END IF;
    END IF;
  END LOOP;

  IF p_coupon_code IS NOT NULL AND BTRIM(p_coupon_code) <> '' THEN
    UPDATE public.coupons
    SET usage_count = COALESCE(usage_count, 0) + 1, updated_at = NOW()
    WHERE UPPER(BTRIM(code)) = UPPER(BTRIM(p_coupon_code));
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'invoice_no', v_invoice_no,
    'total', v_total
  );
END;
$$;
      `);
      return res.status(200).json({ success: true });
    }
    
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
          ${args.p_remarks||''},
          ${args.p_reference_number||''},
          ${args.p_billing_date||null}
        ) as data
      `;
      return res.status(200).json(result.data);
    }
    
    if (fn === 'create_order_with_stock') {
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
          ${args.p_coupon_percentage||0}
        ) as data
      `;
      return res.status(200).json(result.data);
    }

    if (fn === 'create_order_without_stock') {
      const [result] = await sql`
        SELECT public.create_order_without_stock(
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
          ${args.p_coupon_percentage||0}
        ) as data
      `;
      return res.status(200).json(result.data);
    }

    if (fn === 'create_advance_order') {
      const [result] = await sql`
        SELECT public.create_advance_order(
          ${args.p_customer_name||''},
          ${args.p_phone||''},
          ${args.p_address||''},
          ${args.p_product_name||''},
          ${args.p_category||''},
          ${args.p_description||''},
          ${args.p_total_amount||0},
          ${args.p_deposit_amount||0},
          ${args.p_expected_delivery_date||null},
          ${args.p_payment_method||'cash'},
          ${args.p_reference_number||null},
          ${args.p_remarks||null},
          ${args.p_created_by_name||'Staff'},
          ${args.p_split_cash||0},
          ${args.p_split_upi||0},
          ${args.p_split_card||0}
        ) as data
      `;
      return res.status(200).json(result.data);
    }

    if (fn === 'adjust_stock') {
      const [result] = await sql`
        SELECT public.adjust_stock(
          ${args.p_product_id||null},
          ${args.p_variant_id||null},
          ${args.p_quantity_delta||0},
          ${args.p_movement_type||'ADJUSTMENT'},
          ${args.p_reference_type||null},
          ${args.p_reference_id||null},
          ${args.p_note||''}
        ) as data
      `;
      return res.status(200).json(result.data);
    }

    return res.status(404).json({ error: 'Function not found' });
  } catch (error) {
    console.error('RPC Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
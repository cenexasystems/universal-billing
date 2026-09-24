# Universal Look Billing

Independent React, Vite, and Supabase billing administration for Universal Look.

## Local setup

1. Copy `.env.example` to `.env` and add the dedicated Universal Look Supabase URL, public key, and portal passwords.
2. Apply the SQL files in `supabase/migrations` in filename order.
3. Run `npm install`.
4. Run `npm run dev`.

The app keeps the established dashboard, POS billing, catalog, category, coupon, invoice, receipt, WhatsApp, and print flows. Local browser sessions use Universal Look-specific storage keys and do not share state with other shop projects.

## Environment

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WHATSAPP_NUMBER=919159600067`
- `VITE_ADMIN_ID`
- `VITE_ADMIN_PASSWORD`
- `VITE_STAFF_ID` (optional; defaults to `VITE_ADMIN_ID`)
- `VITE_STAFF_PASSWORD`

Brand assets are located in `public/universal-look-logo.png`.

-- Migration: 20260911_0016_rebrand_to_universal-look_mens_wear.sql
-- Rebrand store details to Universal Look and initialize branding storage bucket

BEGIN;

-- 1. Update Store Settings
UPDATE public.store_settings
SET name = 'Universal Look',
    owner_name = '',
    phone = '+91 8925094465, +91 9344159498',
    email = 'universallook600067@gmail.com',
    address = 'Manapparai, Trichy, Tamil Nadu - 621 306',
    updated_at = NOW()
WHERE id = 1;

-- 2. Create public 'branding' storage bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  TRUE,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 10485760;

-- 3. Storage Policies for branding bucket
DROP POLICY IF EXISTS branding_public_read ON storage.objects;
CREATE POLICY branding_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS branding_portal_upload ON storage.objects;
CREATE POLICY branding_portal_upload ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'branding');

DROP POLICY IF EXISTS branding_portal_update ON storage.objects;
CREATE POLICY branding_portal_update ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'branding')
  WITH CHECK (bucket_id = 'branding');

COMMIT;

-- Brand profile (single row, pre-filled for Future)
CREATE TABLE IF NOT EXISTS brand_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL DEFAULT 'Future',
  company_background TEXT,
  service_description TEXT,
  features_benefits TEXT,
  current_offers TEXT,
  pricing_info TEXT,
  speed_turnaround TEXT,
  tone_voice TEXT,
  target_audience TEXT,
  social_proof_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Reference ads
CREATE TABLE IF NOT EXISTS reference_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Content library
CREATE TABLE IF NOT EXISTS library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  thumbnail_url TEXT,
  original_filename TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Generation jobs
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type TEXT NOT NULL CHECK (asset_type IN ('single_image', 'video', 'carousel')),
  source_library_ids UUID[],
  ai_analysis JSONB,
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'error')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Variations (5 per image/video, 3 per carousel)
CREATE TABLE IF NOT EXISTS variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  variation_number INT NOT NULL,
  hook_type TEXT,
  text_blocks JSONB NOT NULL,
  ad_caption TEXT,
  ad_headline TEXT,
  feed_url TEXT,
  story_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Carousel slides
CREATE TABLE IF NOT EXISTS carousel_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id UUID REFERENCES variations(id) ON DELETE CASCADE,
  slide_number INT NOT NULL CHECK (slide_number BETWEEN 1 AND 5),
  library_id UUID REFERENCES library(id),
  text_blocks JSONB NOT NULL,
  feed_url TEXT,
  story_url TEXT,
  UNIQUE(variation_id, slide_number)
);

-- Feedback
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id UUID REFERENCES variations(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS but allow public access (using service role key on server)
ALTER TABLE brand_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE library ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE carousel_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Policies for anon read (server uses service_role for writes)
CREATE POLICY "Allow public read brand_profile" ON brand_profile FOR SELECT USING (true);
CREATE POLICY "Allow public read reference_ads" ON reference_ads FOR SELECT USING (true);
CREATE POLICY "Allow public read library" ON library FOR SELECT USING (true);
CREATE POLICY "Allow public read assets" ON assets FOR SELECT USING (true);
CREATE POLICY "Allow public read variations" ON variations FOR SELECT USING (true);
CREATE POLICY "Allow public read carousel_slides" ON carousel_slides FOR SELECT USING (true);
CREATE POLICY "Allow public read feedback" ON feedback FOR SELECT USING (true);

-- Seed brand profile
INSERT INTO brand_profile (
  brand_name,
  company_background,
  service_description,
  features_benefits,
  current_offers,
  pricing_info,
  speed_turnaround,
  tone_voice,
  target_audience,
  social_proof_notes
) VALUES (
  'Future',
  'Future is an Australian 3PL (third-party logistics) and e-commerce fulfilment company. Founded to help Aussie e-com brands scale without the headache of managing their own warehouse. We believe every online brand deserves enterprise-level fulfilment — fast, affordable, and stress-free. Our mission is to let founders focus on growing their brand while we handle the pick, pack, and ship.',
  'Full-service 3PL: pick, pack, ship, warehousing, returns management, inventory storage, and order fulfilment for e-commerce brands.',
  '- Same-day dispatch on all orders
- $2.50 pick & pack per order
- Shipping under $5
- 250+ brands trust us
- 3M+ orders shipped per year
- Global shipping capabilities
- Easy onboarding — go live in days
- Real-time inventory dashboard
- Shopify, WooCommerce, and marketplace integrations',
  '20% off your first month. $0 setup fee. No lock-in contracts.',
  '$2.50 pick & pack per order. Shipping under $5. No hidden fees.',
  'Same-day dispatch. Fast onboarding — go live in days, not weeks.',
  'Conversational, Aussie, direct, confident. Like a mate who runs a warehouse. Uses emojis naturally. No corporate jargon. Speaks to founders like equals. Casual but professional.',
  'Aussie e-commerce brand owners, DTC (direct-to-consumer) founders, Shopify sellers doing 50–5000 orders per month who are outgrowing self-fulfilment or unhappy with their current 3PL.',
  'Use first name + suburb format. Sound like real Australian customers. Examples: "Sarah, Thornbury", "Dave, Richmond", "Jess, Bondi". Keep testimonials authentic and conversational.'
);

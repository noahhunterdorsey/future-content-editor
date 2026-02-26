export interface TextBlock {
  text: string;
  placement: string;
  text_size: 'large' | 'standard' | 'small';
  style: 'pill' | 'plain';
  pill_color?: 'light' | 'dark';
  capitalization: 'sentence' | 'upper' | 'mixed';
}

export interface Variation {
  id: string;
  asset_id: string;
  variation_number: number;
  hook_type: string;
  text_blocks: TextBlock[];
  ad_caption: string;
  ad_headline: string;
  feed_url: string | null;
  story_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  flagged: boolean;
  flag_reason: string | null;
  created_at: string;
}

export interface Asset {
  id: string;
  asset_type: 'single_image' | 'video' | 'carousel';
  source_library_ids: string[];
  ai_analysis: Record<string, unknown>;
  status: 'processing' | 'ready' | 'error';
  created_at: string;
}

export interface LibraryItem {
  id: string;
  file_url: string;
  file_type: 'image' | 'video';
  thumbnail_url: string | null;
  original_filename: string;
  uploaded_at: string;
}

export interface BrandProfile {
  id: string;
  brand_name: string;
  company_background: string;
  service_description: string;
  features_benefits: string;
  current_offers: string;
  pricing_info: string;
  speed_turnaround: string;
  tone_voice: string;
  target_audience: string;
  social_proof_notes: string;
  updated_at: string;
}

export interface CarouselSlide {
  id: string;
  variation_id: string;
  slide_number: number;
  library_id: string;
  text_blocks: TextBlock[];
  feed_url: string | null;
  story_url: string | null;
}

export interface Feedback {
  id: string;
  variation_id: string;
  status: 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
}

export interface ReferenceAd {
  id: string;
  image_url: string;
  notes: string | null;
  uploaded_at: string;
}

export type AssetFormat = 'single_image' | 'video' | 'carousel';

export interface AIResponse {
  scene_description: string;
  busyness_score: number;
  image_tone: 'light' | 'dark';
  area_analysis: {
    top_third: string;
    middle_third: string;
    bottom_third: string;
  };
  variations: AIVariation[];
}

export interface AIVariation {
  text_blocks: TextBlock[];
  hook_type: string;
  ad_caption: string;
  ad_headline: string;
}

export interface AICarouselResponse {
  carousel_variations: AICarouselVariation[];
}

export interface AICarouselVariation {
  hook_type: string;
  story_summary: string;
  slides: {
    slide_number: number;
    image_index: number;
    text_blocks: TextBlock[];
  }[];
  ad_caption: string;
  ad_headline: string;
}

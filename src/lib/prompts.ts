import { BrandProfile } from './types';

export function buildSystemPrompt(
  brandProfile: BrandProfile,
  feedbackNotes: string[]
): string {
  return `You are an expert direct-response ad copywriter for Future, an Australian 3PL and e-commerce fulfilment company.

BRAND PROFILE:
${JSON.stringify(brandProfile, null, 2)}

REFERENCE AD STYLE ANALYSIS:
- Text overlaid on warehouse/team photos using Instagram Stories-style formatting
- Mix of pill backgrounds (solid rounded rectangles) and plain white text — varies by image area and creative intent
- Per-line pill backgrounds that hug text tightly
- Multiple text blocks at different positions on the same image (top + bottom, or scattered across the frame) creating visual hierarchy
- Large bold text for key stats and numbers ("3 million+"), smaller text for supporting copy
- Deliberate line breaks at natural speech pauses, not auto-wrapped
- Emojis used naturally (✅ 🌍 😏 🤝) — 1-3 per ad, not on every variation
- Capitalization varies: ALL CAPS for feature lists, sentence case for storytelling
- Pricing always front and center
- Conversational Aussie tone — direct, confident, like a mate
- Always mentions "Future" by name
- CTA is warm and action-oriented

PAST FEEDBACK (do more of what was approved, avoid what was rejected):
${feedbackNotes.length > 0 ? feedbackNotes.join('\n') : 'No feedback yet.'}

RULES:
- Lead with features and benefits
- Include pricing when possible
- Reference current offers prominently
- Mention speed of service in at least 2 of 5 variations
- Generate realistic Aussie customer quotes (first name + suburb)
- No hashtags ever
- Use emojis naturally on some variations (not all)
- Direct response marketing — every word earns its place
- Write with emotion
- Always push toward a clear action
- Always mention "Future"

IMAGE ANALYSIS:
1. Describe the scene
2. Identify low-complexity zones for text placement
3. Rate busyness 1-5
4. Determine if image is predominantly light or dark
5. Identify specific areas that are light vs dark (for per-block pill color decisions)

MULTI-BLOCK TEXT LAYOUTS:
- Each variation has 1-3 text blocks placed at different positions
- Each block specifies: text (with explicit \\n line breaks), placement zone, size, style (pill or plain), and capitalization
- Create visual hierarchy: primary message large, supporting text smaller
- Mix pill and plain styles within the same variation for contrast
- Blocks must not overlap. Minimum 40px gap between blocks.
- All blocks must stay within the vertical middle third (17%-83% of image height)

TEXT SIZING (AI decides per block):
- "large": 72-80px primary — for stats, single punchy lines
- "standard": 52px primary — for medium copy
- "small": 42px primary — for longer text or secondary info

LINE BREAKS:
- Specify explicit line breaks with \\n
- Break at natural speech pauses, not arbitrary wrap points
- Each line should be a readable, self-contained chunk

COPY LENGTH — VARY across the 5 variations:
- At least 1 variation: short and punchy (single stat or bold statement, large text)
- At least 1 variation: longer, more persuasive (multi-block, storytelling)
- Rest: medium, mixed styles

PILL VS PLAIN — VARY across the 5 variations:
- Some variations: all pill backgrounds
- Some variations: all plain white text (no pills)
- Some variations: mixed (pill on headline, plain on body, or vice versa)
- The AI decides based on image areas, busyness, and creative variety

PLACEMENT — each variation uses DIFFERENT positions for its text blocks

AD CAPTION (per variation):
- Primary text: max 125 chars, goes below image in Meta ad
- Headline: max 40 chars, bold text below image
- Complements but does not duplicate on-image text

FOR CAROUSELS:
- 5 slides, 3 variations
- Storytelling with emotional progression
- Build to strong CTA on slide 5
- Each variation: different hook, different structure
- AI decides structure (no fixed template)
- Draw on company story for narratives

Respond ONLY in JSON.`;
}

export function buildImagePrompt(): string {
  return `Analyze the uploaded image and the reference ad images. Generate 5 ad variations with multi-block text layouts in the style of the reference ads.

Each variation must use a DIFFERENT hook type. No repeat hook types.

Respond with this exact JSON structure:
{
  "scene_description": "description of what's in the image",
  "busyness_score": 1-5,
  "image_tone": "light" or "dark",
  "area_analysis": {
    "top_third": "description",
    "middle_third": "description",
    "bottom_third": "description"
  },
  "variations": [
    {
      "text_blocks": [
        {
          "text": "Text with explicit\\nline breaks",
          "placement": "zone-name",
          "text_size": "large|standard|small",
          "style": "pill|plain",
          "pill_color": "light|dark",
          "capitalization": "sentence|upper|mixed"
        }
      ],
      "hook_type": "type",
      "ad_caption": "max 125 chars",
      "ad_headline": "max 40 chars"
    }
  ]
}

Valid placement zones: top-center-safe, top-left-safe, top-right-safe, center-safe, center-left-safe, center-right-safe, bottom-center-safe, bottom-left-safe, bottom-right-safe`;
}

export function buildCarouselPrompt(imageCount: number): string {
  return `Analyze the uploaded images and the reference ad images. Generate 3 carousel variations. Each carousel has 5 slides with storytelling progression.

The user has uploaded ${imageCount} image(s). Use image_index (0-based) to assign images to slides. You can reuse images across slides.

Respond with this exact JSON structure:
{
  "carousel_variations": [
    {
      "hook_type": "type",
      "story_summary": "brief description of the story arc",
      "slides": [
        {
          "slide_number": 1,
          "image_index": 0,
          "text_blocks": [
            {
              "text": "Text with\\nline breaks",
              "placement": "zone-name",
              "text_size": "large|standard|small",
              "style": "pill|plain",
              "pill_color": "light|dark",
              "capitalization": "sentence|upper|mixed"
            }
          ]
        }
      ],
      "ad_caption": "max 125 chars",
      "ad_headline": "max 40 chars"
    }
  ]
}

Valid placement zones: top-center-safe, top-left-safe, top-right-safe, center-safe, center-left-safe, center-right-safe, bottom-center-safe, bottom-left-safe, bottom-right-safe`;
}

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, buildImagePrompt, buildCarouselPrompt } from '@/lib/prompts';
import { renderFeedImage, renderStoryImage } from '@/lib/render-engine';
import { v4 as uuidv4 } from 'uuid';
import { BrandProfile, AIResponse, AICarouselResponse, TextBlock } from '@/lib/types';

const anthropic = new Anthropic();

export const maxDuration = 300; // 5 minutes for Vercel

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();

  try {
    const { libraryIds, format } = await request.json();

    if (!libraryIds?.length || !format) {
      return NextResponse.json({ error: 'Missing libraryIds or format' }, { status: 400 });
    }

    // Get brand profile
    const { data: brandProfile } = await supabase
      .from('brand_profile')
      .select('*')
      .limit(1)
      .single();

    if (!brandProfile) {
      return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 });
    }

    // Get recent feedback
    const { data: feedback } = await supabase
      .from('feedback')
      .select('status, notes')
      .order('created_at', { ascending: false })
      .limit(20);

    const feedbackNotes = (feedback || [])
      .filter(f => f.notes)
      .map(f => `[${f.status}] ${f.notes}`);

    // Get reference ads
    const { data: referenceAds } = await supabase
      .from('reference_ads')
      .select('image_url');

    // Get source images
    const { data: libraryItems } = await supabase
      .from('library')
      .select('*')
      .in('id', libraryIds);

    if (!libraryItems?.length) {
      return NextResponse.json({ error: 'No library items found' }, { status: 404 });
    }

    // Create asset record
    const assetId = uuidv4();
    await supabase.from('assets').insert({
      id: assetId,
      asset_type: format,
      source_library_ids: libraryIds,
      status: 'processing',
    });

    // Build messages for Claude
    const systemPrompt = buildSystemPrompt(brandProfile as BrandProfile, feedbackNotes);

    // Prepare image content blocks
    const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    // Add reference ads as images
    if (referenceAds?.length) {
      for (const ref of referenceAds) {
        try {
          const response = await fetch(ref.image_url);
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mediaType = ref.image_url.includes('.png') ? 'image/png' : 'image/jpeg';
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          });
          contentBlocks.push({
            type: 'text',
            text: 'Reference ad above. Match this style.',
          });
        } catch (e) {
          console.warn('Failed to load reference ad:', e);
        }
      }
    }

    // Add source images
    const imageBuffers: Buffer[] = [];
    for (const item of libraryItems) {
      try {
        const response = await fetch(item.file_url);
        const buffer = Buffer.from(await response.arrayBuffer());
        imageBuffers.push(buffer);
        const base64 = buffer.toString('base64');
        const mediaType = item.file_url.includes('.png') ? 'image/png' : 'image/jpeg';
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        });
        contentBlocks.push({
          type: 'text',
          text: `Source image: ${item.original_filename}`,
        });
      } catch (e) {
        console.warn('Failed to load source image:', e);
      }
    }

    // Add the generation prompt
    const userPrompt = format === 'carousel'
      ? buildCarouselPrompt(libraryItems.length)
      : buildImagePrompt();

    contentBlocks.push({ type: 'text', text: userPrompt });

    // Call Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: contentBlocks }],
    });

    const responseText = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const aiResponse = JSON.parse(jsonStr);

    // Store AI analysis
    await supabase.from('assets').update({ ai_analysis: aiResponse }).eq('id', assetId);

    if (format === 'carousel') {
      await processCarousel(supabase, assetId, aiResponse as AICarouselResponse, imageBuffers, libraryItems);
    } else {
      await processImageVariations(supabase, assetId, aiResponse as AIResponse, imageBuffers[0]);
    }

    // Mark as ready
    await supabase.from('assets').update({ status: 'ready' }).eq('id', assetId);

    return NextResponse.json({ assetId });
  } catch (error: unknown) {
    console.error('Generation error:', error);
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function processImageVariations(
  supabase: ReturnType<typeof getServiceSupabase>,
  assetId: string,
  aiResponse: AIResponse,
  imageBuffer: Buffer
) {
  for (let i = 0; i < aiResponse.variations.length; i++) {
    const variation = aiResponse.variations[i];
    const variationId = uuidv4();

    // Render feed (4:5) and story (9:16) versions
    const feedBuffer = await renderFeedImage(imageBuffer, variation.text_blocks);
    const storyBuffer = await renderStoryImage(imageBuffer, variation.text_blocks);

    // Upload to storage
    const feedPath = `outputs/${assetId}/${variationId}_feed.png`;
    const storyPath = `outputs/${assetId}/${variationId}_story.png`;

    await supabase.storage.from('outputs').upload(feedPath, feedBuffer, { contentType: 'image/png' });
    await supabase.storage.from('outputs').upload(storyPath, storyBuffer, { contentType: 'image/png' });

    const feedUrl = supabase.storage.from('outputs').getPublicUrl(feedPath).data.publicUrl;
    const storyUrl = supabase.storage.from('outputs').getPublicUrl(storyPath).data.publicUrl;

    await supabase.from('variations').insert({
      id: variationId,
      asset_id: assetId,
      variation_number: i + 1,
      hook_type: variation.hook_type,
      text_blocks: variation.text_blocks,
      ad_caption: variation.ad_caption,
      ad_headline: variation.ad_headline,
      feed_url: feedUrl,
      story_url: storyUrl,
    });
  }
}

async function processCarousel(
  supabase: ReturnType<typeof getServiceSupabase>,
  assetId: string,
  aiResponse: AICarouselResponse,
  imageBuffers: Buffer[],
  libraryItems: { id: string }[]
) {
  for (let i = 0; i < aiResponse.carousel_variations.length; i++) {
    const carouselVar = aiResponse.carousel_variations[i];
    const variationId = uuidv4();

    // Use first slide's text_blocks for the variation record
    const allTextBlocks = carouselVar.slides.flatMap(s => s.text_blocks);

    await supabase.from('variations').insert({
      id: variationId,
      asset_id: assetId,
      variation_number: i + 1,
      hook_type: carouselVar.hook_type,
      text_blocks: allTextBlocks,
      ad_caption: carouselVar.ad_caption,
      ad_headline: carouselVar.ad_headline,
    });

    // Process each slide
    for (const slide of carouselVar.slides) {
      const imgIdx = Math.min(slide.image_index, imageBuffers.length - 1);
      const imageBuffer = imageBuffers[imgIdx];
      const slideId = uuidv4();

      const feedBuffer = await renderFeedImage(imageBuffer, slide.text_blocks);
      const storyBuffer = await renderStoryImage(imageBuffer, slide.text_blocks);

      const feedPath = `outputs/${assetId}/${variationId}_slide${slide.slide_number}_feed.png`;
      const storyPath = `outputs/${assetId}/${variationId}_slide${slide.slide_number}_story.png`;

      await supabase.storage.from('outputs').upload(feedPath, feedBuffer, { contentType: 'image/png' });
      await supabase.storage.from('outputs').upload(storyPath, storyBuffer, { contentType: 'image/png' });

      const feedUrl = supabase.storage.from('outputs').getPublicUrl(feedPath).data.publicUrl;
      const storyUrl = supabase.storage.from('outputs').getPublicUrl(storyPath).data.publicUrl;

      await supabase.from('carousel_slides').insert({
        id: slideId,
        variation_id: variationId,
        slide_number: slide.slide_number,
        library_id: libraryItems[imgIdx]?.id || libraryItems[0].id,
        text_blocks: slide.text_blocks,
        feed_url: feedUrl,
        story_url: storyUrl,
      });
    }
  }
}

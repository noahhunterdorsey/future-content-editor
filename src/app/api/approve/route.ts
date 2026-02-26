import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  const { variationId, status, notes } = await request.json();

  if (!variationId || !status) {
    return NextResponse.json({ error: 'Missing variationId or status' }, { status: 400 });
  }

  // Update variation status
  await supabase
    .from('variations')
    .update({ status })
    .eq('id', variationId);

  // Store feedback
  await supabase.from('feedback').insert({
    variation_id: variationId,
    status,
    notes: notes || null,
  });

  // If approved, copy to approved bucket
  if (status === 'approved') {
    const { data: variation } = await supabase
      .from('variations')
      .select('*')
      .eq('id', variationId)
      .single();

    if (variation) {
      // Copy feed image
      if (variation.feed_url) {
        const feedPath = extractStoragePath(variation.feed_url, 'outputs');
        if (feedPath) {
          const { data: feedData } = await supabase.storage.from('outputs').download(feedPath);
          if (feedData) {
            const buffer = Buffer.from(await feedData.arrayBuffer());
            await supabase.storage.from('approved').upload(
              `${variationId}_feed.png`,
              buffer,
              { contentType: 'image/png' }
            );
          }
        }
      }

      // Copy story image
      if (variation.story_url) {
        const storyPath = extractStoragePath(variation.story_url, 'outputs');
        if (storyPath) {
          const { data: storyData } = await supabase.storage.from('outputs').download(storyPath);
          if (storyData) {
            const buffer = Buffer.from(await storyData.arrayBuffer());
            await supabase.storage.from('approved').upload(
              `${variationId}_story.png`,
              buffer,
              { contentType: 'image/png' }
            );
          }
        }
      }

      // Handle carousel slides
      const { data: slides } = await supabase
        .from('carousel_slides')
        .select('*')
        .eq('variation_id', variationId);

      if (slides?.length) {
        for (const slide of slides) {
          if (slide.feed_url) {
            const path = extractStoragePath(slide.feed_url, 'outputs');
            if (path) {
              const { data } = await supabase.storage.from('outputs').download(path);
              if (data) {
                const buffer = Buffer.from(await data.arrayBuffer());
                await supabase.storage.from('approved').upload(
                  `${variationId}_slide${slide.slide_number}_feed.png`,
                  buffer,
                  { contentType: 'image/png' }
                );
              }
            }
          }
          if (slide.story_url) {
            const path = extractStoragePath(slide.story_url, 'outputs');
            if (path) {
              const { data } = await supabase.storage.from('outputs').download(path);
              if (data) {
                const buffer = Buffer.from(await data.arrayBuffer());
                await supabase.storage.from('approved').upload(
                  `${variationId}_slide${slide.slide_number}_story.png`,
                  buffer,
                  { contentType: 'image/png' }
                );
              }
            }
          }
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

function extractStoragePath(url: string, bucket: string): string | null {
  const match = url.match(new RegExp(`/storage/v1/object/public/${bucket}/(.+)`));
  return match ? match[1] : null;
}

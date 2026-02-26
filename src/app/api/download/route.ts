import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import archiver from 'archiver';
import { Readable } from 'stream';

export async function GET(request: NextRequest) {
  const supabase = getServiceSupabase();
  const { searchParams } = new URL(request.url);
  const variationId = searchParams.get('variationId');
  const downloadAll = searchParams.get('all') === 'true';

  let variations;

  if (downloadAll) {
    const { data } = await supabase
      .from('variations')
      .select('*, carousel_slides(*)')
      .eq('status', 'approved');
    variations = data;
  } else if (variationId) {
    const { data } = await supabase
      .from('variations')
      .select('*, carousel_slides(*)')
      .eq('id', variationId);
    variations = data;
  } else {
    return NextResponse.json({ error: 'Missing variationId or all=true' }, { status: 400 });
  }

  if (!variations?.length) {
    return NextResponse.json({ error: 'No variations found' }, { status: 404 });
  }

  // Build ZIP
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  // Build CSV
  let csv = 'Filename,Ad Caption,Headline,Hook Type\n';

  for (const variation of variations) {
    const prefix = `variation_${variation.variation_number}`;

    // Download and add feed image
    if (variation.feed_url) {
      try {
        const response = await fetch(variation.feed_url);
        const buffer = Buffer.from(await response.arrayBuffer());
        archive.append(buffer, { name: `${prefix}_feed.png` });
      } catch (e) {
        console.warn('Failed to download feed image');
      }
    }

    // Download and add story image
    if (variation.story_url) {
      try {
        const response = await fetch(variation.story_url);
        const buffer = Buffer.from(await response.arrayBuffer());
        archive.append(buffer, { name: `${prefix}_story.png` });
      } catch (e) {
        console.warn('Failed to download story image');
      }
    }

    // Handle carousel slides
    if (variation.carousel_slides?.length) {
      for (const slide of variation.carousel_slides) {
        if (slide.feed_url) {
          try {
            const response = await fetch(slide.feed_url);
            const buffer = Buffer.from(await response.arrayBuffer());
            archive.append(buffer, { name: `${prefix}_slide${slide.slide_number}_feed.png` });
          } catch (e) {
            console.warn('Failed to download carousel slide');
          }
        }
        if (slide.story_url) {
          try {
            const response = await fetch(slide.story_url);
            const buffer = Buffer.from(await response.arrayBuffer());
            archive.append(buffer, { name: `${prefix}_slide${slide.slide_number}_story.png` });
          } catch (e) {
            console.warn('Failed to download carousel slide');
          }
        }
      }
    }

    // Escape CSV values
    const escapeCsv = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    csv += `${escapeCsv(prefix)},${escapeCsv(variation.ad_caption || '')},${escapeCsv(variation.ad_headline || '')},${escapeCsv(variation.hook_type || '')}\n`;
  }

  archive.append(csv, { name: 'copy.csv' });
  await archive.finalize();

  const zipBuffer = Buffer.concat(chunks);

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="future-ads.zip"',
    },
  });
}

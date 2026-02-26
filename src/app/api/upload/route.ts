import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  const formData = await request.formData();
  const files = formData.getAll('files') as File[];

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const uploaded = [];

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const isHeic = ['heic', 'heif'].includes(ext);
    const fileType = ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : 'image';
    const id = uuidv4();

    let buffer = Buffer.from(await file.arrayBuffer());
    let uploadExt = ext;
    let contentType = file.type;

    // Convert HEIC/HEIF to JPG — browsers can't display HEIC
    if (isHeic) {
      const converted = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
      buffer = converted as Buffer<ArrayBuffer>;
      uploadExt = 'jpg';
      contentType = 'image/jpeg';
    }

    const storagePath = `${id}.${uploadExt}`;

    const { error: uploadError } = await supabase.storage
      .from('library')
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from('library')
      .getPublicUrl(storagePath);

    const fileUrl = urlData.publicUrl;

    // Create thumbnail for images
    let thumbnailUrl = fileUrl;
    if (fileType === 'video') {
      thumbnailUrl = fileUrl; // For videos, use the file URL as placeholder
    }

    const { data, error } = await supabase
      .from('library')
      .insert({
        id,
        file_url: fileUrl,
        file_type: fileType,
        thumbnail_url: thumbnailUrl,
        original_filename: file.name,
      })
      .select()
      .single();

    if (error) {
      console.error('DB insert error:', error);
      continue;
    }

    uploaded.push(data);
  }

  return NextResponse.json({ items: uploaded });
}

export async function DELETE(request: NextRequest) {
  const supabase = getServiceSupabase();
  const { ids } = await request.json() as { ids: string[] };

  if (!ids?.length) {
    return NextResponse.json({ error: 'No IDs provided' }, { status: 400 });
  }

  // Get file URLs so we can delete from storage
  const { data: items } = await supabase
    .from('library')
    .select('id, file_url')
    .in('id', ids);

  // Delete from storage
  if (items?.length) {
    const storagePaths = items.map(item => {
      const url = new URL(item.file_url);
      const parts = url.pathname.split('/library/');
      return parts[parts.length - 1];
    }).filter(Boolean);

    if (storagePaths.length) {
      await supabase.storage.from('library').remove(storagePaths);
    }
  }

  // Delete from database
  const { error } = await supabase
    .from('library')
    .delete()
    .in('id', ids);

  if (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import convert from 'heic-convert';

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  const formData = await request.formData();
  const files = formData.getAll('files') as File[];

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const results = await Promise.allSettled(
    files.map(async (file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const isHeic = ['heic', 'heif'].includes(ext);
      const fileType = ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : 'image';
      const id = uuidv4();

      let buffer = Buffer.from(await file.arrayBuffer());
      let uploadExt = ext;
      let contentType = file.type;

      // Convert HEIC/HEIF to JPG — Sharp lacks HEVC decoder, so use heic-convert
      if (isHeic) {
        const jpegData = await convert({
          buffer: new Uint8Array(buffer) as unknown as ArrayBufferLike,
          format: 'JPEG',
          quality: 0.9,
        });
        buffer = Buffer.from(jpegData as unknown as ArrayBuffer);
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
        throw new Error(`Storage upload failed for ${file.name}: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('library')
        .getPublicUrl(storagePath);

      const fileUrl = urlData.publicUrl;
      const thumbnailUrl = fileUrl;

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
        throw new Error(`DB insert failed for ${file.name}: ${error.message}`);
      }

      return data;
    })
  );

  const uploaded = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map(r => r.value);

  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason?.message || 'Unknown error');

  if (failed.length) {
    console.error('Some uploads failed:', failed);
  }

  return NextResponse.json({ items: uploaded, errors: failed });
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

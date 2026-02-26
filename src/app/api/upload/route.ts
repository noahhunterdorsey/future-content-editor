import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

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
    const fileType = ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : 'image';
    const id = uuidv4();
    const storagePath = `library/${id}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('library')
      .upload(storagePath.replace('library/', ''), buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from('library')
      .getPublicUrl(storagePath.replace('library/', ''));

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

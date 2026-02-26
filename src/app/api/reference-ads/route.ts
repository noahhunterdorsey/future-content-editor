import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('reference_ads')
    .select('*')
    .order('uploaded_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const supabase = getServiceSupabase();
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const id = uuidv4();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${id}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('references')
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from('references').getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('reference_ads')
    .insert({ id, image_url: urlData.publicUrl })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const supabase = getServiceSupabase();
  const { id } = await request.json();

  const { data: ad } = await supabase
    .from('reference_ads')
    .select('image_url')
    .eq('id', id)
    .single();

  if (ad) {
    const path = ad.image_url.split('/references/').pop();
    if (path) {
      await supabase.storage.from('references').remove([path]);
    }
  }

  await supabase.from('reference_ads').delete().eq('id', id);
  return NextResponse.json({ success: true });
}

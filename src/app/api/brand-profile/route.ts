import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export async function GET() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('brand_profile')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest) {
  const supabase = getServiceSupabase();
  const body = await request.json();

  const { data: existing } = await supabase
    .from('brand_profile')
    .select('id')
    .limit(1)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('brand_profile')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

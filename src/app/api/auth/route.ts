import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { code } = await request.json();
  const accessCode = process.env.ACCESS_CODE;

  if (!accessCode) {
    return NextResponse.json({ error: 'Access code not configured' }, { status: 500 });
  }

  if (code === accessCode) {
    const response = NextResponse.json({ success: true });
    response.cookies.set('future_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    return response;
  }

  return NextResponse.json({ error: 'Invalid access code' }, { status: 401 });
}

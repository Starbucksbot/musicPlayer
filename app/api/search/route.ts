import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  if (!q) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}&maxResults=10`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.error) {
    return NextResponse.json({ error: data.error.message }, { status: 500 });
  }
  return NextResponse.json(data.items);
}
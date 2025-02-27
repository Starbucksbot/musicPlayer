import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { videoId: string } }) {
  const { videoId } = params;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&relatedToVideoId=${videoId}&type=video&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}&maxResults=1`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.error) {
    return NextResponse.json({ error: data.error.message }, { status: 500 });
  }
  return NextResponse.json(data.items[0] || null);
}
import { NextRequest, NextResponse } from 'next/server';
import ytdl from 'ytdl-core';

export async function GET(req: NextRequest, { params }: { params: { videoId: string } }) {
  const { videoId } = params;
  try {
    const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
      filter: 'audioonly',
      quality: 'highestaudio',
    });
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to stream audio' }, { status: 500 });
  }
}
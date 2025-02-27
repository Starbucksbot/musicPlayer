import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs-extra';
import path from 'path';

const HISTORY_FILE = path.join(process.cwd(), 'history.json');

export async function GET() {
  const history = await fs.readJson(HISTORY_FILE);
  return NextResponse.json(history);
}

export async function POST(req: NextRequest) {
  const { videoId, title, artist } = await req.json();
  const history = await fs.readJson(HISTORY_FILE);
  const newEntry = { videoId, title, artist, timestamp: Date.now() };
  history.unshift(newEntry);
  if (history.length > 30) history.pop();
  await fs.writeJson(HISTORY_FILE, history);
  return NextResponse.json({ success: true });
}
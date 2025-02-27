import fs from 'fs/promises';
import path from 'path';

const filePath = path.join(process.cwd(), 'data', 'history.json');

async function getHistory() {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { pinned: [], recent: [] };
  }
}

async function saveHistory(history) {
  await fs.writeFile(filePath, JSON.stringify(history, null, 2));
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { videoId } = req.body;
    const history = await getHistory();
    if (!history.pinned.includes(videoId)) {
      history.recent.unshift(videoId);
      history.recent = history.recent.slice(0, 30);
    }
    await saveHistory(history);
    res.status(200).json({ message: 'Song added to history' });
  }
}
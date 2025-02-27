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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(history, null, 2));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const history = await getHistory();
    res.status(200).json(history);
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const port = 4200; // Runs on port 4200 as per requirements
const historyFile = path.join(__dirname, '..', 'data', 'history.json');
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'YOUR_API_KEY_HERE'; // Add to .env

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'))); // Serve frontend

async function getHistory() {
  try {
    const data = await fs.readFile(historyFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return { pinned: [], recent: [] };
  }
}

async function saveHistory(history) {
  await fs.mkdir(path.dirname(historyFile), { recursive: true });
  await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
}

app.get('/api/history', async (req, res) => {
  const history = await getHistory();
  res.json(history);
});

app.post('/api/play', async (req, res) => {
  const { videoId } = req.body;
  const history = await getHistory();
  if (!history.pinned.includes(videoId)) {
    history.recent.unshift(videoId);
    history.recent = history.recent.slice(0, 30);
  }
  await saveHistory(history);
  res.json({ message: 'Song added to history' });
});

app.post('/api/pin', async (req, res) => {
  const { videoId } = req.body;
  const history = await getHistory();
  if (!history.pinned.includes(videoId) && history.pinned.length < 5) {
    history.pinned.unshift(videoId);
  }
  await saveHistory(history);
  res.json({ message: 'Song pinned' });
});

app.post('/api/unpin', async (req, res) => {
  const { videoId } = req.body;
  const history = await getHistory();
  history.pinned = history.pinned.filter((id) => id !== videoId);
  await saveHistory(history);
  res.json({ message: 'Song unpinned' });
});

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter is required' });
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`
  );
  const data = await response.json();
  res.json(data.items || []);
});

app.get('/api/related', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId parameter is required' });
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&relatedToVideoId=${videoId}&key=${YOUTUBE_API_KEY}`
  );
  const data = await response.json();
  res.json(data.items || []);
});

app.get('/api/video', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId parameter is required' });
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`
  );
  const data = await response.json();
  res.json(data.items[0] || {});
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);
const app = express();
const port = 4200;
const historyFile = path.join(__dirname, '..', 'data', 'history.json');
const queueFile = path.join(__dirname, '..', 'data', 'queue.json');
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'your-key-here';

let playerState = { currentVideoId: null, isPlaying: false, queue: [] };
let quotaExceeded = false;
let lastQuotaErrorTime = null;
const QUOTA_WAIT_TIME = 2 * 60 * 60 * 1000;
const cache = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (quotaExceeded && lastQuotaErrorTime && Date.now() - lastQuotaErrorTime > QUOTA_WAIT_TIME) {
    quotaExceeded = false;
    lastQuotaErrorTime = null;
  }
  next();
});

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

async function getQueue() {
  try {
    const data = await fs.readFile(queueFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  await fs.mkdir(path.dirname(queueFile), { recursive: true });
  await fs.writeFile(queueFile, JSON.stringify(queue, null, 2));
}

(async () => {
  playerState.queue = await getQueue();
})();

app.get('/api/history', async (req, res) => res.json(await getHistory()));

app.post('/api/play', async (req, res) => {
  const { videoId, title } = req.body;
  playerState.currentVideoId = videoId;
  playerState.isPlaying = true;
  const history = await getHistory();
  if (!history.recent.some(item => item.id === videoId)) {
    history.recent.unshift({ id: videoId, title });
    history.recent = history.recent.slice(0, 30);
  }
  await saveHistory(history);
  res.json({ message: 'Playing' });
});

app.post('/api/pause', (req, res) => {
  playerState.isPlaying = false;
  res.json({ message: 'Paused' });
});

app.post('/api/resume', (req, res) => {
  playerState.isPlaying = true;
  res.json({ message: 'Resumed' });
});

app.post('/api/clear-queue', async (req, res) => {
  playerState.queue = [];
  await saveQueue(playerState.queue);
  res.json({ message: 'Queue cleared' });
});

app.post('/api/add-to-queue', async (req, res) => {
  const { videoId, title } = req.body;
  if (playerState.queue.length < 10) {
    playerState.queue.push({ id: videoId, title });
    await saveQueue(playerState.queue);
    res.json({ message: 'Added to queue' });
  } else {
    res.status(400).json({ error: 'Queue full (max 10)' });
  }
});

app.post('/api/next', async (req, res) => {
  const nextItem = playerState.queue.shift();
  await saveQueue(playerState.queue);
  if (nextItem) {
    playerState.currentVideoId = nextItem.id;
    playerState.isPlaying = true;
  } else {
    playerState.currentVideoId = null;
    playerState.isPlaying = false;
  }
  res.json({ message: 'Moved to next' });
});

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });
  const cacheKey = `search:${q}`;
  if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));
  try {
    const results = quotaExceeded
      ? await searchWithYtDlp(q)
      : await searchWithYouTubeAPI(q);
    cache.set(cacheKey, results);
    setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000);
    res.json(results);
  } catch (err) {
    console.error(`Search error: ${err.message}`);
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

app.get('/api/audio', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId required' });
  console.log(`Loading audio for videoId: ${videoId}`);
  try {
    const { stdout } = await execPromise(
      `yt-dlp -f bestaudio --no-playlist --buffer-size 16k "https://www.youtube.com/watch?v=${videoId}" --get-url`
    );
    res.redirect(stdout.trim());
  } catch (err) {
    console.error(`Audio load error for ${videoId}: ${err.message}`);
    res.status(500).json({ error: 'Audio streaming failed', details: err.message });
  }
});

app.get('/api/state', (req, res) => res.json(playerState));

async function searchWithYtDlp(query) {
  const { stdout } = await execPromise(
    `yt-dlp "ytsearch5:${query}" --dump-json --flat-playlist --no-playlist`
  );
  return stdout.trim().split('\n').map(line => {
    const item = JSON.parse(line);
    return { id: { videoId: item.id }, snippet: { title: item.title } };
  });
}

async function searchWithYouTubeAPI(query) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=5&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    if (!response.ok || data.error) {
      console.error(`YouTube API error: ${data.error?.message || response.statusText}`);
      if (data.error?.code === 403) {
        quotaExceeded = true;
        lastQuotaErrorTime = Date.now();
        return await searchWithYtDlp(query);
      }
      throw new Error(data.error?.message || 'API request failed');
    }
    return data.items || [];
  } catch (err) {
    console.error(`YouTube API fetch error: ${err.message}`);
    throw err;
  }
}

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
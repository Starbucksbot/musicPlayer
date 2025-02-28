const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const port = 4200;
const historyFile = path.join(__dirname, '..', 'data', 'history.json');
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Shared state for multi-user control
let playerState = {
  currentVideoId: null,
  isPlaying: false,
  queue: [], // Queue to hold up to 10 songs
};

// Middleware for logging requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

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

// API Routes
app.get('/api/history', async (req, res) => {
  const history = await getHistory();
  res.json(history);
});

app.post('/api/play', async (req, res) => {
  const { videoId } = req.body;
  playerState.currentVideoId = videoId;
  playerState.isPlaying = true;
  console.log(`Playing video: ${videoId}`);
  const history = await getHistory();
  if (!history.pinned.includes(videoId)) {
    history.recent.unshift(videoId);
    history.recent = history.recent.slice(0, 30);
  }
  await saveHistory(history);
  res.json({ message: 'Song added to history' });
});

app.post('/api/pause', (req, res) => {
  playerState.isPlaying = false;
  console.log('Paused playback');
  res.json({ message: 'Paused' });
});

app.post('/api/resume', (req, res) => {
  playerState.isPlaying = true;
  console.log('Resumed playback');
  res.json({ message: 'Resumed' });
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
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`
      );
      const data = await response.json();
      if (data.error) {
        console.error(`YouTube API error for search query "${q}":`, data.error);
        return res.status(500).json({ error: 'Failed to fetch search results', details: data.error });
      }
      res.json(data.items || []);
    } catch (err) {
      console.error(`Error fetching search results for query "${q}":`, err.message);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  });

  app.get('/api/related', async (req, res) => {
    const { videoId } = req.query;
    if (!videoId) return res.status(400).json({ error: 'videoId parameter is required' });
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&relatedToVideoId=${videoId}&key=${YOUTUBE_API_KEY}`
      );
      const data = await response.json();
      if (data.error) {
        console.error(`YouTube API error for related videos (videoId: ${videoId}):`, data.error);
        return res.status(500).json({ error: 'Failed to fetch related videos', details: data.error });
      }
      res.json(data.items || []);
    } catch (err) {
      console.error(`Error fetching related videos for videoId ${videoId}:`, err.message);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  });

app.get('/api/video', async (req, res) => {
    const { videoId } = req.query;
    if (!videoId) return res.status(400).json({ error: 'videoId parameter is required' });
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`
      );
      const data = await response.json();
      if (data.error) {
        console.error(`YouTube API error for videoId ${videoId}:`, data.error);
        return res.status(500).json({ error: 'Failed to fetch video details', details: data.error });
      }
      res.json(data.items && data.items[0] ? data.items[0] : {});
    } catch (err) {
      console.error(`Error fetching video details for videoId ${videoId}:`, err.message);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    }
  });

// Shared state endpoints
app.get('/api/state', (req, res) => {
  res.json(playerState);
});

app.post('/api/add-to-queue', (req, res) => {
  const { videoId } = req.body;
  if (playerState.queue.length < 10) {
    playerState.queue.push(videoId);
    console.log(`Added to queue: ${videoId}`);
    res.json({ message: 'Added to queue' });
  } else {
    res.status(400).json({ error: 'Queue is full (max 10 songs)' });
  }
});

app.post('/api/next', (req, res) => {
  const nextVideoId = playerState.queue.shift();
  if (nextVideoId) {
    playerState.currentVideoId = nextVideoId;
    playerState.isPlaying = true;
    console.log(`Playing next in queue: ${nextVideoId}`);
  } else {
    playerState.currentVideoId = null;
    playerState.isPlaying = false;
    console.log('Queue is empty');
  }
  res.json({ message: 'Moved to next song' });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');
const { exec } = require('child_process');
const util = require('util');

// Promisify exec for async/await
const execPromise = util.promisify(exec);

const app = express();
const port = 4200;
const historyFile = path.join(__dirname, '..', 'data', 'history.json');
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Shared state for multi-user control and quota tracking
let playerState = {
  currentVideoId: null,
  isPlaying: false,
  queue: [],
};

// Quota tracking
let quotaExceeded = false;
let lastQuotaErrorTime = null;
const QUOTA_RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_RETRIES = 3; // Retry limit for API calls

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (quotaExceeded && lastQuotaErrorTime && Date.now() - lastQuotaErrorTime > QUOTA_RESET_INTERVAL) {
    console.log('Resetting quota exceeded flag after 24 hours');
    quotaExceeded = false;
    lastQuotaErrorTime = null;
  }
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
  console.log(`Playing audio: ${videoId}`);
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
  if (quotaExceeded) {
    console.log('Quota exceeded, falling back to yt-dlp for search');
    try {
      const results = await searchWithYtDlp(q);
      res.json(results);
    } catch (err) {
      console.error(`Fallback search failed for query "${q}":`, err.message);
      res.status(500).json({ error: 'Fallback search failed', details: err.message });
    }
    return;
  }
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`
      );
      const data = await response.json();
      if (data.error) {
        console.error(`YouTube API error for search query "${q}":`, data.error);
        if (data.error.code === 403 && data.error.errors[0]?.reason === 'quotaExceeded') {
          quotaExceeded = true;
          lastQuotaErrorTime = Date.now();
          console.log('Quota exceeded, stopping YouTube API calls');
          const results = await searchWithYtDlp(q);
          res.json(results);
        } else {
          res.status(500).json({ error: 'Failed to fetch search results', details: data.error });
        }
        return;
      }
      res.json(data.items || []);
      return;
    } catch (err) {
      retries++;
      console.error(`Error fetching search results for query "${q}" (attempt ${retries}/${MAX_RETRIES}):`, err.message);
      if (retries === MAX_RETRIES) {
        console.log('Max retries reached, falling back to yt-dlp');
        try {
          const results = await searchWithYtDlp(q);
          res.json(results);
        } catch (fallbackErr) {
          console.error(`Fallback search failed for query "${q}":`, fallbackErr.message);
          res.status(500).json({ error: 'Internal server error', details: fallbackErr.message });
        }
      }
    }
  }
});

app.get('/api/related', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId parameter is required' });
  if (quotaExceeded) {
    console.log('Quota exceeded, skipping related videos fetch');
    res.json([]);
    return;
  }
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&relatedToVideoId=${videoId}&key=${YOUTUBE_API_KEY}`
      );
      const data = await response.json();
      if (data.error) {
        console.error(`YouTube API error for related videos (videoId: ${videoId}):`, data.error);
        if (data.error.code === 403 && data.error.errors[0]?.reason === 'quotaExceeded') {
          quotaExceeded = true;
          lastQuotaErrorTime = Date.now();
          console.log('Quota exceeded, stopping YouTube API calls');
          res.json([]);
        } else {
          res.status(500).json({ error: 'Failed to fetch related videos', details: data.error });
        }
        return;
      }
      res.json(data.items || []);
      return;
    } catch (err) {
      retries++;
      console.error(`Error fetching related videos for videoId ${videoId} (attempt ${retries}/${MAX_RETRIES}):`, err.message);
      if (retries === MAX_RETRIES) {
        console.log('Max retries reached, returning empty results');
        res.json([]);
      }
    }
  }
});

app.get('/api/video', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId parameter is required' });
  if (quotaExceeded) {
    console.log('Quota exceeded, falling back to yt-dlp for metadata');
    try {
      const metadata = await metadataWithYtDlp(videoId);
      res.json(metadata);
    } catch (err) {
      console.error(`Fallback metadata fetch failed for videoId ${videoId}:`, err.message);
      res.status(500).json({ error: 'Fallback metadata fetch failed', details: err.message });
    }
    return;
  }
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`
      );
      const data = await response.json();
      if (data.error) {
        console.error(`YouTube API error for videoId ${videoId}:`, data.error);
        if (data.error.code === 403 && data.error.errors[0]?.reason === 'quotaExceeded') {
          quotaExceeded = true;
          lastQuotaErrorTime = Date.now();
          console.log('Quota exceeded, stopping YouTube API calls');
          const metadata = await metadataWithYtDlp(videoId);
          res.json(metadata);
        } else {
          res.status(500).json({ error: 'Failed to fetch video details', details: data.error });
        }
        return;
      }
      res.json(data.items && data.items[0] ? data.items[0] : {});
      return;
    } catch (err) {
      retries++;
      console.error(`Error fetching video details for videoId ${videoId} (attempt ${retries}/${MAX_RETRIES}):`, err.message);
      if (retries === MAX_RETRIES) {
        console.log('Max retries reached, falling back to yt-dlp');
        try {
          const metadata = await metadataWithYtDlp(videoId);
          res.json(metadata);
        } catch (fallbackErr) {
          console.error(`Fallback metadata fetch failed for videoId ${videoId}:`, fallbackErr.message);
          res.status(500).json({ error: 'Internal server error', details: fallbackErr.message });
        }
      }
    }
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

// Audio streaming endpoint using yt-dlp
app.get('/api/audio', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId parameter is required' });
  try {
    const { stdout, stderr } = await execPromise(
      `yt-dlp -f bestaudio --get-url "https://www.youtube.com/watch?v=${videoId}"`
    );
    if (stderr) {
      console.error(`yt-dlp stderr for videoId ${videoId}:`, stderr);
      throw new Error(stderr);
    }
    const audioUrl = stdout.trim();
    res.redirect(audioUrl);
  } catch (err) {
    console.error(`Error streaming audio for videoId ${videoId}:`, err.message);
    res.status(500).json({ error: 'Failed to stream audio', details: err.message });
  }
});

// Fallback search using yt-dlp
async function searchWithYtDlp(query) {
  console.log(`Performing yt-dlp search for query: ${query}`);
  try {
    const { stdout, stderr } = await execPromise(
      `yt-dlp "ytsearch5:${query}" --dump-json --flat-playlist`
    );
    if (stderr) {
      console.error(`yt-dlp stderr for search query "${query}":`, stderr);
      throw new Error(stderr);
    }
    const results = stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .map((item) => ({
        id: { videoId: item.id },
        snippet: { title: item.title },
      }));
    console.log(`yt-dlp search found ${results.length} results for query: ${query}`);
    return results;
  } catch (err) {
    console.error(`yt-dlp search failed for query "${query}":`, err.message);
    return [];
  }
}

// Fallback metadata fetch using yt-dlp
async function metadataWithYtDlp(videoId) {
  console.log(`Fetching metadata with yt-dlp for videoId: ${videoId}`);
  try {
    const { stdout, stderr } = await execPromise(
      `yt-dlp "https://www.youtube.com/watch?v=${videoId}" --dump-json`
    );
    if (stderr) {
      console.error(`yt-dlp stderr for videoId ${videoId}:`, stderr);
      throw new Error(stderr);
    }
    const data = JSON.parse(stdout);
    return {
      id: { videoId },
      snippet: { title: data.title || 'Unknown Title' },
    };
  } catch (err) {
    console.error(`yt-dlp metadata fetch failed for videoId ${videoId}:`, err.message);
    return { id: { videoId }, snippet: { title: 'Unknown Title' } };
  }
}

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
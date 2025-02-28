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
const QUOTA_WAIT_TIME = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
const MAX_RETRIES = 3;

// Track processing requests to avoid duplicates
const processingRequests = new Set();

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (quotaExceeded && lastQuotaErrorTime && Date.now() - lastQuotaErrorTime > QUOTA_WAIT_TIME) {
    console.log('Resetting quota exceeded flag after 2 hours');
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
      const history = JSON.parse(data);
      return {
        pinned: Array.isArray(history.pinned) ? history.pinned.filter(item => item && typeof item === 'object' && item.id) : [],
        recent: Array.isArray(history.recent) ? history.recent.filter(item => item && typeof item === 'object' && item.id) : [],
      };
    } catch (err) {
      console.error('Error reading history file:', err.message);
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

// Initialize queue from file
(async () => {
  playerState.queue = await getQueue();
})();

// API Routes
app.get('/api/history', async (req, res) => {
  const history = await getHistory();
  res.json(history);
});

app.post('/api/play', async (req, res) => {
    const { videoId, title } = req.body;
    playerState.currentVideoId = videoId;
    playerState.isPlaying = true;
    console.log(`Playing audio: ${videoId} - ${title}`);
    const history = await getHistory();
    // Ensure pinned and recent are arrays and filter out invalid entries
    history.pinned = Array.isArray(history.pinned) ? history.pinned.filter(item => item && typeof item === 'object' && item.id) : [];
    history.recent = Array.isArray(history.recent) ? history.recent.filter(item => item && typeof item === 'object' && item.id) : [];
    const exists = history.pinned.some((item) => item.id === videoId) || history.recent.some((item) => item.id === videoId);
    if (!exists) {
      history.recent.unshift({ id: videoId, title });
      history.recent = history.recent.slice(0, 30);
    } else {
      history.recent = history.recent.filter((item) => item.id !== videoId);
      history.recent.unshift({ id: videoId, title });
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
    history.pinned = Array.isArray(history.pinned) ? history.pinned.filter(item => item && typeof item === 'object' && item.id) : [];
    history.recent = Array.isArray(history.recent) ? history.recent.filter(item => item && typeof item === 'object' && item.id) : [];
    const video = history.recent.find((item) => item.id === videoId) || history.pinned.find((item) => item.id === videoId);
    if (video && !history.pinned.some((item) => item.id === videoId) && history.pinned.length < 5) {
      history.pinned.unshift({ id: videoId, title: video.title });
      history.recent = history.recent.filter((item) => item.id !== videoId);
    }
    await saveHistory(history);
    res.json({ message: 'Song pinned' });
  });
  
  app.post('/api/unpin', async (req, res) => {
    const { videoId } = req.body;
    const history = await getHistory();
    history.pinned = Array.isArray(history.pinned) ? history.pinned.filter(item => item && typeof item === 'object' && item.id) : [];
    history.recent = Array.isArray(history.recent) ? history.recent.filter(item => item && typeof item === 'object' && item.id) : [];
    const video = history.pinned.find((item) => item.id === videoId);
    if (video) {
      history.pinned = history.pinned.filter((item) => item.id !== videoId);
      history.recent.unshift({ id: videoId, title: video.title });
      history.recent = history.recent.slice(0, 30);
    }
    await saveHistory(history);
    res.json({ message: 'Song unpinned' });
  });
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter is required' });
  const requestKey = `search:${q}`;
  if (processingRequests.has(requestKey)) {
    console.log(`Duplicate search request for query "${q}", skipping`);
    return res.status(202).json({ message: 'Request already processing' });
  }
  processingRequests.add(requestKey);
  try {
    if (quotaExceeded) {
      console.log('Quota exceeded, falling back to yt-dlp for search');
      const results = await searchWithYtDlp(q);
      res.json(results);
    } else {
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
            const results = await searchWithYtDlp(q);
            res.json(results);
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error processing search for query "${q}":`, err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  } finally {
    processingRequests.delete(requestKey);
  }
});

app.get('/api/related', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId parameter is required' });
  const requestKey = `related:${videoId}`;
  if (processingRequests.has(requestKey)) {
    console.log(`Duplicate related request for videoId "${videoId}", skipping`);
    return res.status(202).json({ message: 'Request already processing' });
  }
  processingRequests.add(requestKey);
  try {
    if (quotaExceeded) {
      console.log('Quota exceeded, using yt-dlp for related videos');
      const results = await getRelatedWithYtDlp(videoId);
      res.json(results);
    } else {
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
              const results = await getRelatedWithYtDlp(videoId);
              res.json(results);
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
            console.log('Max retries reached, falling back to yt-dlp');
            const results = await getRelatedWithYtDlp(videoId);
            res.json(results);
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error processing related videos for videoId ${videoId}:`, err.message);
    res.json([]);
  } finally {
    processingRequests.delete(requestKey);
  }
});

app.get('/api/video', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'videoId parameter is required' });
  const requestKey = `video:${videoId}`;
  if (processingRequests.has(requestKey)) {
    console.log(`Duplicate metadata request for videoId "${videoId}", skipping`);
    return res.status(202).json({ message: 'Request already processing' });
  }
  processingRequests.add(requestKey);
  try {
    if (quotaExceeded) {
      console.log('Quota exceeded, falling back to yt-dlp for metadata');
      const metadata = await metadataWithYtDlp(videoId);
      res.json(metadata);
    } else {
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
            const metadata = await metadataWithYtDlp(videoId);
            res.json(metadata);
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error processing metadata for videoId ${videoId}:`, err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  } finally {
    processingRequests.delete(requestKey);
  }
});

// Shared state endpoints
app.get('/api/state', (req, res) => {
  res.json(playerState);
});

app.post('/api/add-to-queue', async (req, res) => {
    const { videoId, title } = req.body;
    playerState.queue = Array.isArray(playerState.queue) ? playerState.queue.filter(item => item && typeof item === 'object' && item.id) : [];
    if (playerState.queue.length < 10) {
      playerState.queue.push({ id: videoId, title });
      await saveQueue(playerState.queue);
      console.log(`Added to queue: ${videoId} - ${title}`);
      res.json({ message: 'Added to queue' });
    } else {
      res.status(400).json({ error: 'Queue is full (max 10 songs)' });
    }
  });
  
  app.post('/api/next', async (req, res) => {
    playerState.queue = Array.isArray(playerState.queue) ? playerState.queue.filter(item => item && typeof item === 'object' && item.id) : [];
    const nextItem = playerState.queue.shift();
    await saveQueue(playerState.queue);
    if (nextItem) {
      playerState.currentVideoId = nextItem.id;
      playerState.isPlaying = true;
      console.log(`Playing next in queue: ${nextItem.id} - ${nextItem.title}`);
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
  const requestKey = `audio:${videoId}`;
  if (processingRequests.has(requestKey)) {
    console.log(`Duplicate audio request for videoId "${videoId}", skipping`);
    return res.status(202).json({ message: 'Request already processing' });
  }
  processingRequests.add(requestKey);
  try {
    const { stdout, stderr } = await execPromise(
      `yt-dlp -f bestaudio --no-playlist --buffer-size 16k --no-cache-dir --no-part "https://www.youtube.com/watch?v=${videoId}" --get-url`
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
  } finally {
    processingRequests.delete(requestKey);
  }
});

// Search using yt-dlp
async function searchWithYtDlp(query) {
  console.log(`Performing yt-dlp search for query: ${query}`);
  try {
    const { stdout, stderr } = await execPromise(
      `yt-dlp "ytsearch5:${query}" --dump-json --flat-playlist --no-playlist --no-cache-dir`
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

// Fetch related videos using yt-dlp
async function getRelatedWithYtDlp(videoId) {
  console.log(`Fetching related videos with yt-dlp for videoId: ${videoId}`);
  try {
    const { stdout: infoStdout } = await execPromise(
      `yt-dlp "https://www.youtube.com/watch?v=${videoId}" --dump-json --no-playlist --no-cache-dir`
    );
    const videoInfo = JSON.parse(infoStdout);
    const title = videoInfo.title || '';
    const relatedQuery = `${title} related`;
    const { stdout, stderr } = await execPromise(
      `yt-dlp "ytsearch5:${relatedQuery}" --dump-json --flat-playlist --no-playlist --no-cache-dir`
    );
    if (stderr) {
      console.error(`yt-dlp stderr for related videos (videoId: ${videoId}):`, stderr);
      throw new Error(stderr);
    }
    const results = stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((item) => item.id !== videoId)
      .slice(0, 5)
      .map((item) => ({
        id: { videoId: item.id },
        snippet: { title: item.title },
      }));
    console.log(`yt-dlp found ${results.length} related videos for videoId: ${videoId}`);
    return results;
  } catch (err) {
    console.error(`yt-dlp related videos fetch failed for videoId ${videoId}:`, err.message);
    return [];
  }
}

// Fetch metadata using yt-dlp
async function metadataWithYtDlp(videoId) {
  console.log(`Fetching metadata with yt-dlp for videoId: ${videoId}`);
  try {
    const { stdout, stderr } = await execPromise(
      `yt-dlp "https://www.youtube.com/watch?v=${videoId}" --dump-json --no-playlist --no-cache-dir`
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
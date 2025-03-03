const express = require('express');
const { google } = require('googleapis');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const API_KEY = process.env.API_KEY; // Retrieve API key from environment
const youtube = google.youtube({ version: 'v3', auth: API_KEY });
const CACHE_DIR = path.join(__dirname, 'cache');
const HISTORY_FILE = path.join(__dirname, 'history.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

// Serve static files from 'public'
app.use(express.static('public'));

// Search endpoint
app.get('/search', async (req, res) => {
  const query = req.query.q;
  try {
    const searchRes = await youtube.search.list({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: 10,
    });
    const items = searchRes.data.items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.default.url,
    }));
    res.json(items);
  } catch (error) {
    if (error.code === 403) { // Quota exceeded
      res.status(429).json({ error: 'API quota exceeded. Try again later.' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Failed to search' });
    }
  }
});

// Stream endpoint
app.get('/stream/:videoId', (req, res) => {
  const videoId = req.params.videoId;
  const title = decodeURIComponent(req.query.title || 'Unknown');
  const cacheFile = path.join(CACHE_DIR, `${videoId}.mp3`);

  if (fs.existsSync(cacheFile)) {
    // Serve cached file with range support
    const stat = fs.statSync(cacheFile);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(cacheFile, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
      };
      res.writeHead(200, head);
      fs.createReadStream(cacheFile).pipe(res);
    }
  } else {
    // Stream from ytdl-core and cache
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
    const cacheStream = fs.createWriteStream(`${cacheFile}.part`);

    // Set headers (basic streaming, no range support for simplicity)
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.pipe(res);
    stream.pipe(cacheStream);

    stream.on('end', () => {
      fs.rename(`${cacheFile}.part`, cacheFile, err => {
        if (err) console.error('Error renaming cache file:', err);
      });
    });

    stream.on('error', (err) => {
      console.error('Streaming error:', err);
      if (!res.headersSent) {
        res.status(500).send('Failed to stream audio');
      }
    });
  }

  // Update history
  updateHistory(videoId, title);
});

// History endpoint
app.get('/history', (req, res) => {
  if (fs.existsSync(HISTORY_FILE)) {
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    res.json(history);
  } else {
    res.json([]);
  }
});

// Update history function
function updateHistory(videoId, title) {
  let history = [];
  if (fs.existsSync(HISTORY_FILE)) {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  }
  const newEntry = { videoId, title, timestamp: new Date().toISOString() };
  history.unshift(newEntry);
  if (history.length > 5) history.pop();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
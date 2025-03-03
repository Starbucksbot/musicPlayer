const express = require('express');
const { google } = require('googleapis');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const youtube = google.youtube({ version: 'v3', auth: API_KEY });
const CACHE_DIR = path.join(__dirname, 'cache');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const QUEUE_FILE = path.join(__dirname, 'queue.json');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

app.use(express.static('public'));
app.use(express.json());

// Server-side state
let currentSong = null;
let clients = [];
let sleepTimer = null;
let sleepTimeout = null;

app.get('/search', async (req, res) => {
  const query = req.query.q;
  try {
    const searchRes = await youtube.search.list({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: 5,
    });
    const items = searchRes.data.items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.default.url,
    }));
    res.json(items);
  } catch (error) {
    if (error.code === 403 || error.code === 429) {
      console.log('API rate limit hit, falling back to yt-dlp');
      exec(`yt-dlp "ytsearch5:${query}" --dump-json --flat-playlist --no-download`, (err, stdout, stderr) => {
        if (err) {
          console.error('yt-dlp search error:', err, stderr);
          return res.status(500).json({ error: 'Search failed with yt-dlp' });
        }
        const results = stdout.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line))
          .map(item => ({
            videoId: item.id,
            title: item.title,
            thumbnail: item.thumbnails?.[0]?.url || '',
          }));
        res.json(results.slice(0, 5));
      });
    } else {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search' });
    }
  }
});

app.get('/stream/:videoId', (req, res) => {
  const videoId = req.params.videoId;
  const title = decodeURIComponent(req.query.title || 'Unknown');
  const cacheFile = path.join(CACHE_DIR, `${videoId}.mp3`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  if (fs.existsSync(cacheFile)) {
    serveCachedFile(cacheFile, req, res);
  } else {
    const ytdlp = spawn('yt-dlp', [
      url,
      '-f', 'bestaudio',
      '-o', '-',
      '--no-part',
      '--no-playlist',
      '--extract-audio',
      '--audio-format', 'mp3',
    ]);

    res.setHeader('Content-Type', 'audio/mpeg');
    ytdlp.stdout.pipe(res);

    ytdlp.stderr.on('data', (data) => {
      console.error('yt-dlp stderr:', data.toString());
    });

    ytdlp.on('error', (err) => {
      console.error('yt-dlp spawn error:', err);
      if (!res.headersSent) {
        res.status(500).send('Failed to stream audio with yt-dlp');
      }
    });

    ytdlp.on('close', (code) => {
      if (code !== 0 && !res.headersSent) {
        res.status(500).send('yt-dlp exited with error');
      }
    });

    const cacheStream = fs.createWriteStream(cacheFile);
    ytdlp.stdout.pipe(cacheStream);
  }

  const updateHistoryFlag = req.query.updateHistory === 'true';
  if (updateHistoryFlag) {
    updateHistory(videoId, title, cacheFile);
  }
});

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.push(res);

  const sendUpdate = () => {
    const queue = fs.existsSync(QUEUE_FILE) ? JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) : [];
    const data = JSON.stringify({ currentSong, queue, sleepTimer });
    res.write(`data: ${data}\n\n`);
  };

  sendUpdate();

  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

app.get('/queue', (req, res) => {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const queueData = fs.readFileSync(QUEUE_FILE, 'utf8');
      if (!queueData) {
        return res.json([]);
      }
      const queue = JSON.parse(queueData);
      res.json(queue);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Queue parsing error:', error);
    res.json([]);
  }
});

app.post('/queue/add', (req, res) => {
  const { videoId, title, playNext = false } = req.body;
  let queue = [];
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const queueData = fs.readFileSync(QUEUE_FILE, 'utf8');
      if (queueData) {
        queue = JSON.parse(queueData);
      }
    }
  } catch (error) {
    console.error('Queue read error:', error);
    queue = [];
  }

  const newEntry = { videoId, title, cacheFile: path.join(CACHE_DIR, `${videoId}.mp3`) };
  if (playNext) {
    queue.unshift(newEntry);
  } else {
    queue.push(newEntry);
  }
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  
  predownloadQueue(queue);
  broadcastUpdate();
  
  res.json(queue);
});

app.post('/queue/remove-first', (req, res) => {
  let queue = [];
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const queueData = fs.readFileSync(QUEUE_FILE, 'utf8');
      if (queueData) {
        queue = JSON.parse(queueData);
      }
    }
    if (queue.length > 0) {
      const nextSong = queue.shift();
      currentSong = nextSong;
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
      predownloadQueue(queue);
      broadcastUpdate();
    } else {
      currentSong = null;
      broadcastUpdate();
    }
    res.json(queue);
  } catch (error) {
    console.error('Queue remove error:', error);
    res.status(500).json({ error: 'Failed to remove from queue' });
  }
});

app.post('/queue/remove', (req, res) => {
  const { index } = req.body;
  let queue = [];
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const queueData = fs.readFileSync(QUEUE_FILE, 'utf8');
      if (queueData) {
        queue = JSON.parse(queueData);
      }
    }
    if (index >= 0 && index < queue.length) {
      queue.splice(index, 1);
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
      predownloadQueue(queue);
      broadcastUpdate();
    }
    res.json(queue);
  } catch (error) {
    console.error('Queue remove error:', error);
    res.status(500).json({ error: 'Failed to remove from queue' });
  }
});

app.post('/queue/clear', (req, res) => {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify([], null, 2));
  currentSong = null;
  if (sleepTimeout) {
    clearTimeout(sleepTimeout);
    sleepTimer = null;
  }
  broadcastUpdate();
  res.json([]);
});

app.post('/play', (req, res) => {
  const { videoId, title } = req.body;
  currentSong = { videoId, title, cacheFile: path.join(CACHE_DIR, `${videoId}.mp3`) };
  broadcastUpdate();
  updateHistory(videoId, title, currentSong.cacheFile);
  res.json({ success: true });
});

app.post('/song-ended', (req, res) => {
  playNextInQueue();
  res.json({ success: true });
});

app.post('/sleep', (req, res) => {
  const { milliseconds } = req.body;
  if (sleepTimeout) clearTimeout(sleepTimeout);
  sleepTimer = milliseconds;
  sleepTimeout = setTimeout(() => {
    currentSong = null;
    fs.writeFileSync(QUEUE_FILE, JSON.stringify([], null, 2));
    sleepTimer = null;
    sleepTimeout = null;
    broadcastUpdate();
  }, milliseconds);
  broadcastUpdate();
  res.json({ success: true });
});

app.get('/history', (req, res) => {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const historyData = fs.readFileSync(HISTORY_FILE, 'utf8');
      if (!historyData) {
        return res.json([]);
      }
      const history = JSON.parse(historyData);
      res.json(history);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('History parsing error:', error);
    res.json([]);
  }
});

function predownloadQueue(queue) {
  for (let i = 0; i < Math.min(3, queue.length); i++) {
    const { videoId, title, cacheFile } = queue[i];
    if (!fs.existsSync(cacheFile)) {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const ytdlp = spawn('yt-dlp', [
        url,
        '-f', 'bestaudio',
        '-o', cacheFile,
        '--no-part',
        '--no-playlist',
        '--extract-audio',
        '--audio-format', 'mp3',
      ]);

      ytdlp.stderr.on('data', (data) => {
        console.error(`yt-dlp predownload stderr for ${videoId}:`, data.toString());
      });

      ytdlp.on('error', (err) => {
        console.error(`yt-dlp predownload error for ${videoId}:`, err);
      });

      ytdlp.on('close', (code) => {
        if (code === 0) {
          console.log(`Predownloaded ${title} to ${cacheFile}`);
        } else {
          console.error(`yt-dlp predownload failed for ${videoId} with code ${code}`);
        }
      });
    }
  }
}

function serveCachedFile(cacheFile, req, res) {
  const stat = fs.statSync(cacheFile);
  const fileSize = stat.size;
  const range = req ? req.headers.range : null;

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
}

function updateHistory(videoId, title, cacheFile) {
  let history = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const historyData = fs.readFileSync(HISTORY_FILE, 'utf8');
      if (historyData) {
        history = JSON.parse(historyData);
      }
    }
  } catch (error) {
    console.error('History update parsing error:', error);
    history = [];
  }

  const existingIndex = history.findIndex(item => item.videoId === videoId);
  if (existingIndex !== -1) {
    history.splice(existingIndex, 1);
  }

  const newEntry = { videoId, title, timestamp: new Date().toISOString(), cacheFile };
  history.unshift(newEntry);

  if (history.length > 10) {
    const removedEntry = history.pop();
    if (removedEntry.cacheFile && fs.existsSync(removedEntry.cacheFile)) {
      fs.unlink(removedEntry.cacheFile, (err) => {
        if (err) console.error(`Error deleting cache file ${removedEntry.cacheFile}:`, err);
        else console.log(`Deleted cache file: ${removedEntry.cacheFile}`);
      });
    }
  }

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function broadcastUpdate() {
  const queue = fs.existsSync(QUEUE_FILE) ? JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) : [];
  const data = JSON.stringify({ currentSong, queue, sleepTimer });
  clients.forEach(client => client.write(`data: ${data}\n\n`));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
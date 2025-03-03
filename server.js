const express = require('express');
const { google } = require('googleapis');
const ytdl = require('ytdl-core');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;
const youtube = google.youtube({ version: 'v3', auth: API_KEY });
const CACHE_DIR = path.join(__dirname, 'cache');
const HISTORY_FILE = path.join(__dirname, 'history.json');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

app.use(express.static('public'));

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
    if (error.code === 403) {
      res.status(429).json({ error: 'API quota exceeded. Try again later.' });
    } else {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search' });
    }
  }
});

app.get('/stream/:videoId', async (req, res) => {
  const videoId = req.params.videoId;
  const title = decodeURIComponent(req.query.title || 'Unknown');
  const cacheFile = path.join(CACHE_DIR, `${videoId}.mp3`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  if (fs.existsSync(cacheFile)) {
    serveCachedFile(cacheFile, req, res);
  } else {
    try {
      const info = await ytdl.getInfo(url);
      const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
      const cacheStream = fs.createWriteStream(`${cacheFile}.part`);

      res.setHeader('Content-Type', 'audio/mpeg');
      stream.pipe(res);
      stream.pipe(cacheStream);

      stream.on('end', () => {
        fs.rename(`${cacheFile}.part`, cacheFile, err => {
          if (err) console.error('Error renaming cache file:', err);
        });
      });

      stream.on('error', async (err) => {
        console.error('ytdl-core streaming error:', err);
        if (!res.headersSent) {
          await fallbackToYtdlp(url, cacheFile, req, res);
        }
      });
    } catch (err) {
      console.error('ytdl-core initialization error:', err);
      await fallbackToYtdlp(url, cacheFile, req, res);
    }
  }

  updateHistory(videoId, title, cacheFile);
});

function fallbackToYtdlp(url, cacheFile, req, res) {
  return new Promise((resolve, reject) => {
    const command = `yt-dlp -x --audio-format mp3 -o "${cacheFile}" "${url}"`;
    exec(command, (error, stdout, stderr) => {
      console.log('yt-dlp stdout:', stdout);
      console.error('yt-dlp stderr:', stderr);
      if (error) {
        console.error('yt-dlp error:', error);
        if (!res.headersSent) {
          res.status(500).send('Failed to stream audio with yt-dlp');
        }
        reject(error);
        return;
      }
      if (fs.existsSync(cacheFile)) {
        serveCachedFile(cacheFile, req, res);
        resolve();
      } else {
        if (!res.headersSent) {
          res.status(500).send('Failed to cache audio with yt-dlp');
        }
        reject(new Error('Cache file not found after yt-dlp'));
      }
    });
  });
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

  // Add new entry
  const newEntry = { videoId, title, timestamp: new Date().toISOString(), cacheFile };
  history.unshift(newEntry);

  // Remove oldest entry and its cache file if exceeding 10
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
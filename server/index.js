require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 4200;
const HISTORY_FILE = path.join(__dirname, '../history.json');

app.use(cors());
app.use(express.json());

// Initialize history file if it doesn't exist
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeJsonSync(HISTORY_FILE, []);
}

// Get audio stream from YouTube
app.get('/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;
  try {
    const stream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
      filter: 'audioonly',
      quality: 'highestaudio',
    });
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

// Search YouTube videos
app.get('/search', async (req, res) => {
  const { q } = req.query;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&key=${process.env.YOUTUBE_API_KEY}&maxResults=10`;
  const response = await fetch(url);
  const data = await response.json();
  res.json(data.items);
});

// Get recommendations
app.get('/recommend/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&relatedToVideoId=${videoId}&type=video&key=${process.env.YOUTUBE_API_KEY}&maxResults=1`;
  const response = await fetch(url);
  const data = await response.json();
  res.json(data.items[0]);
});

// Save to history
app.post('/history', async (req, res) => {
  const { videoId, title, artist } = req.body;
  const history = await fs.readJson(HISTORY_FILE);
  const newEntry = { videoId, title, artist, timestamp: Date.now() };
  history.unshift(newEntry);
  if (history.length > 30) history.pop(); // Limit to 30 items
  await fs.writeJson(HISTORY_FILE, history);
  res.json({ success: true });
});

// Get history
app.get('/history', async (req, res) => {
  const history = await fs.readJson(HISTORY_FILE);
  res.json(history);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
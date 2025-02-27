const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const port = 4300;
const historyFile = path.join(__dirname, '..', 'data', 'history.json');

app.use(express.json());

// Helper to read/write history
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
app.get('/history', async (req, res) => {
  const history = await getHistory();
  res.json(history);
});

app.post('/play', async (req, res) => {
  const { videoId } = req.body;
  const history = await getHistory();
  if (!history.pinned.includes(videoId)) {
    history.recent.unshift(videoId);
    history.recent = history.recent.slice(0, 30);
  }
  await saveHistory(history);
  res.json({ message: 'Song added to history' });
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
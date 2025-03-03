let audioPlayer, currentVideoId, isPlaying = false, history = { pinned: [], recent: [] }, queue = [];
let sleepTimerId = null, sleepEndTime = null;

document.addEventListener('DOMContentLoaded', () => {
  audioPlayer = document.getElementById('audioPlayer');
  syncWithServer();
  setInterval(syncWithServer, 10000);

  audioPlayer.addEventListener('timeupdate', updateProgress);
  audioPlayer.addEventListener('play', () => {
    isPlaying = true;
    document.getElementById('playButton').textContent = 'Pause';
    fetch('/api/resume', { method: 'POST' });
  });
  audioPlayer.addEventListener('pause', () => {
    isPlaying = false;
    document.getElementById('playButton').textContent = 'Play';
    fetch('/api/pause', { method: 'POST' });
  });

  document.getElementById('playButton').addEventListener('click', () => {
    if (!currentVideoId) return;
    isPlaying ? audioPlayer.pause() : audioPlayer.play();
  });

  document.getElementById('prevButton').addEventListener('click', () => {
    const prevItem = history.recent.find(item => item.id !== currentVideoId);
    if (prevItem) playAudio(prevItem.id, prevItem.title);
  });

  document.getElementById('nextButton').addEventListener('click', () => fetch('/api/next', { method: 'POST' }).then(syncWithServer));
  document.getElementById('clearQueueButton').addEventListener('click', () => fetch('/api/clear-queue', { method: 'POST' }).then(fetchQueue));
  document.getElementById('sleepButton').addEventListener('click', toggleSleepMenu);

  const searchInput = document.getElementById('searchInput');
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => search(searchInput.value), 500);
  });

  document.getElementById('searchButton').addEventListener('click', () => search(searchInput.value));
  document.getElementById('stopButton').addEventListener('click', stopSearch);
});

async function syncWithServer() {
  const response = await fetch('/api/state');
  const state = await response.json();
  currentVideoId = state.currentVideoId;
  isPlaying = state.isPlaying;
  queue = state.queue;
  if (currentVideoId) {
    audioPlayer.src = `/api/audio?videoId=${currentVideoId}`;
    document.getElementById('albumArt').src = `https://img.youtube.com/vi/${currentVideoId}/hqdefault.jpg`;
    document.getElementById('albumArt').style.display = 'block';
    document.getElementById('searchResults').style.display = 'none';
    isPlaying ? audioPlayer.play() : audioPlayer.pause();
  } else {
    document.getElementById('albumArt').style.display = 'none';
  }
  fetchHistory();
  fetchQueue();
}

async function search(query) {
  if (!query) return;
  document.getElementById('searchLoading').style.display = 'block';
  document.getElementById('searchSuggestions').style.display = 'none';
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const results = await response.json();
  document.getElementById('searchLoading').style.display = 'none';
  const searchResults = document.getElementById('searchResults');
  searchResults.style.display = 'flex';
  searchResults.innerHTML = results.slice(0, 5).map(song => `
    <div class="result-item glass">
      <span onclick="playAudio('${song.id.videoId}', '${song.snippet.title}')">${song.snippet.title}</span>
      <button class="button queue-button" onclick="addToQueue('${song.id.videoId}', '${song.snippet.title}')">Queue</button>
    </div>
  `).join('');
}

function stopSearch() {
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('searchLoading').style.display = 'none';
}

async function playAudio(videoId, title) {
  currentVideoId = videoId;
  audioPlayer.src = `/api/audio?videoId=${videoId}`;
  audioPlayer.play();
  await fetch('/api/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, title })
  });
}

async function addToQueue(videoId, title) {
  await fetch('/api/add-to-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, title })
  });
  fetchQueue();
}

async function fetchHistory() {
  const response = await fetch('/api/history');
  history = await response.json();
  document.getElementById('historyList').innerHTML = [...history.pinned, ...history.recent].map(item => `
    <div class="history-item">
      <span onclick="playAudio('${item.id}', '${item.title}')">${item.title}</span>
    </div>
  `).join('');
}

async function fetchQueue() {
  document.getElementById('queueList').innerHTML = queue.map((item, i) => `
    <div class="queue-item" onclick="playAudio('${item.id}', '${item.title}')">${i + 1}: ${item.title}</div>
  `).join('');
}

function updateProgress() {
  const current = audioPlayer.currentTime;
  const duration = audioPlayer.duration || 0;
  document.getElementById('currentTime').textContent = formatTime(current);
  document.getElementById('duration').textContent = formatTime(duration);
  document.getElementById('progressBar').value = duration ? (current / duration) * 100 : 0;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function toggleSleepMenu() {
  const queuePanel = document.getElementById('queuePanel');
  if (queuePanel.classList.contains('sleep-menu')) {
    queuePanel.classList.remove('sleep-menu');
    fetchQueue();
  } else {
    queuePanel.classList.add('sleep-menu');
    document.getElementById('queueList').innerHTML = [1, 2, 3, 4, 5, 6, 12].map(hour => `
      <div class="sleep-option" onclick="setSleepTimer(${hour})">${hour} Hour${hour !== 1 ? 's' : ''}</div>
    `).join('');
  }
}

function setSleepTimer(hours) {
  if (sleepTimerId) clearTimeout(sleepTimerId);
  const sleepTime = hours * 60 * 60 * 1000;
  sleepEndTime = Date.now() + sleepTime;
  sleepTimerId = setTimeout(() => {
    audioPlayer.pause();
    sleepTimerId = null;
    sleepEndTime = null;
    document.getElementById('sleepCountdown').textContent = '';
  }, sleepTime);
  setInterval(updateSleepCountdown, 1000);
  toggleSleepMenu();
}

function updateSleepCountdown() {
  if (!sleepEndTime) return;
  const remaining = Math.max(0, sleepEndTime - Date.now());
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  document.getElementById('sleepCountdown').textContent = `${hours}h ${minutes}m`;
}
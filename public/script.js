let audioPlayer, currentVideoId, isPlaying = false, history = { pinned: [], recent: [] }, queue = [];
let sleepTimerId = null, sleepEndTime = null;

document.addEventListener('DOMContentLoaded', () => {
  audioPlayer = document.getElementById('audioPlayer');
  loadLocalHistory();
  syncWithServer();
  setInterval(syncWithServer, 10000);

  audioPlayer.addEventListener('timeupdate', updateProgress);
  audioPlayer.addEventListener('play', () => {
    isPlaying = true;
    document.getElementById('playButton').textContent = 'Pause';
    document.getElementById('albumArt').style.display = 'block';
    document.getElementById('searchResults').style.display = 'none';
    fetch('/api/resume', { method: 'POST' });
  });
  audioPlayer.addEventListener('pause', () => {
    isPlaying = false;
    document.getElementById('playButton').textContent = 'Play';
    document.getElementById('albumArt').style.display = 'none';
    fetch('/api/pause', { method: 'POST' });
  });
  audioPlayer.addEventListener('loadstart', () => {
    console.log(`Audio loading started for ${currentVideoId}`);
    document.getElementById('loadingBar').style.display = 'block';
  });
  audioPlayer.addEventListener('progress', updateLoadingBar);
  audioPlayer.addEventListener('canplay', () => {
    document.getElementById('loadingBar').style.display = 'none';
  });
  audioPlayer.addEventListener('error', (e) => console.error('Audio error:', e));

  document.getElementById('playButton').addEventListener('click', togglePlay);
  document.getElementById('prevButton').addEventListener('click', playPrevious);
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
  if (currentVideoId && audioPlayer.src !== `/api/audio?videoId=${currentVideoId}`) {
    audioPlayer.src = `/api/audio?videoId=${currentVideoId}`;
    if (isPlaying) audioPlayer.play().catch(err => console.error('Play error:', err));
    else document.getElementById('albumArt').style.display = 'none';
  }
  document.getElementById('albumArt').src = `https://img.youtube.com/vi/${currentVideoId}/hqdefault.jpg`;
  fetchHistory();
  fetchQueue();
}

async function search(query) {
  if (!query) return;
  document.getElementById('searchLoading').style.display = 'block';
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const results = await response.json();
  document.getElementById('searchLoading').style.display = 'none';
  const searchResults = document.getElementById('searchResults');
  searchResults.style.display = 'flex';
  searchResults.innerHTML = results.slice(0, 5).map(song => `
    <div class="result-item glass p-3 rounded-lg flex justify-between items-center hover:scale-105 transition-transform">
      <span class="cursor-pointer" onclick="playAudio('${song.id.videoId}', '${song.snippet.title}')">${song.snippet.title}</span>
      <button class="button queue-button px-4 py-2" onclick="addToQueue('${song.id.videoId}', '${song.snippet.title}')">Queue</button>
    </div>
  `).join('');
}

function stopSearch() {
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('searchLoading').style.display = 'none';
}

async function playAudio(videoId, title) {
  if (currentVideoId === videoId && audioPlayer.paused) {
    audioPlayer.play();
    return;
  }
  currentVideoId = videoId;
  audioPlayer.src = `/api/audio?videoId=${videoId}`;
  audioPlayer.play().catch(err => console.error('Play interrupted:', err));
  await fetch('/api/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, title })
  });
  localStorage.setItem('recentSong', JSON.stringify({ id: videoId, title }));
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
    <div class="history-item p-2 hover:bg-gray-700/50 rounded cursor-pointer" onclick="playAudio('${item.id}', '${item.title}')">${item.title}</div>
  `).join('');
}

async function fetchQueue() {
  document.getElementById('queueList').innerHTML = queue.map((item, i) => `
    <div class="queue-item p-2 hover:bg-gray-700/50 rounded cursor-pointer" onclick="playAudio('${item.id}', '${item.title}')">${i + 1}: ${item.title}</div>
  `).join('');
}

function updateProgress() {
  const current = audioPlayer.currentTime;
  const duration = audioPlayer.duration || 0;
  document.getElementById('currentTime').textContent = formatTime(current);
  document.getElementById('duration').textContent = formatTime(duration);
  document.getElementById('progressBar').value = duration ? (current / duration) * 100 : 0;
}

function updateLoadingBar() {
  if (audioPlayer.buffered.length > 0) {
    const buffered = audioPlayer.buffered.end(0);
    const duration = audioPlayer.duration || 100;
    document.getElementById('loadingBar').value = (buffered / duration) * 100;
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function togglePlay() {
  if (!currentVideoId) return;
  isPlaying ? audioPlayer.pause() : audioPlayer.play().catch(err => console.error('Play error:', err));
}

function playPrevious() {
  const prevItem = history.recent.find(item => item.id !== currentVideoId);
  if (prevItem) playAudio(prevItem.id, prevItem.title);
}

function toggleSleepMenu() {
  const queuePanel = document.getElementById('queuePanel');
  if (queuePanel.classList.contains('sleep-menu')) {
    queuePanel.classList.remove('sleep-menu');
    fetchQueue();
  } else {
    queuePanel.classList.add('sleep-menu');
    document.getElementById('queueList').innerHTML = [1, 2, 3, 4, 5, 6, 12].map(hour => `
      <div class="sleep-option p-2 hover:bg-pink-500 rounded cursor-pointer" onclick="setSleepTimer(${hour})">${hour} Hour${hour !== 1 ? 's' : ''}</div>
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

function loadLocalHistory() {
  const recentSong = JSON.parse(localStorage.getItem('recentSong') || '{}');
  if (recentSong.id) {
    document.getElementById('historyList').innerHTML = `
      <div class="history-item p-2 hover:bg-gray-700/50 rounded cursor-pointer" onclick="playAudio('${recentSong.id}', '${recentSong.title}')">${recentSong.title}</div>
    `;
  }
}
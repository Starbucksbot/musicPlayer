const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const searchResults = document.getElementById('search-results');
const audioPlayer = document.getElementById('audio-player');
const recentlyPlayedBtn = document.getElementById('recently-played-btn');
const queueBtn = document.getElementById('queue-btn');
const sleepBtn = document.getElementById('sleep-btn');
const recentlyPlayedList = document.getElementById('recently-played-list');
const queueList = document.getElementById('queue-list');
const sleepOptions = document.getElementById('sleep-options');
const sleepTimerDisplay = document.getElementById('sleep-timer');
const loadingBar = document.getElementById('loading-bar');
const loadingProgress = document.querySelector('.loading-progress');
const loadingPercent = document.getElementById('loading-percent');

let debounceTimer;
let sleepTimer = null;
let loadingInterval = null;

function triggerSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const query = searchInput.value.trim();
    if (query) {
      fetchSearchResults(query);
    } else {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
    }
  }, 300);
}

searchInput.addEventListener('input', triggerSearch);
searchButton.addEventListener('click', triggerSearch);

async function fetchSearchResults(query) {
  try {
    const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (response.status === 429) {
      alert(data.error);
      searchResults.style.display = 'none';
    } else {
      displaySearchResults(data);
    }
  } catch (error) {
    console.error('Error fetching search results:', error);
  }
}

function displaySearchResults(results) {
  searchResults.innerHTML = '';
  results.forEach(result => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <img src="${result.thumbnail}" alt="${result.title}" width="50">
      <span>${result.title}</span>
    `;
    item.addEventListener('click', () => {
      playSong(result.videoId, result.title);
      searchResults.style.display = 'none';
    });
    searchResults.appendChild(item);
  });
  searchResults.style.display = 'block';
}

function playSong(videoId, title) {
  const encodedTitle = encodeURIComponent(title);
  const streamUrl = `/stream/${videoId}?title=${encodedTitle}`;
  audioPlayer.src = streamUrl;
  audioPlayer.load();

  // Show loading bar and simulate progress
  loadingBar.style.display = 'block';
  let progress = 0;
  loadingProgress.style.width = '0%';
  loadingPercent.textContent = '0%';

  if (loadingInterval) clearInterval(loadingInterval);
  loadingInterval = setInterval(() => {
    progress += 2; // Simulate progress (adjust speed as needed)
    if (progress >= 100) {
      progress = 100;
      clearInterval(loadingInterval);
    }
    loadingProgress.style.width = `${progress}%`;
    loadingPercent.textContent = `${progress}%`;
  }, 100); // Update every 100ms

  audioPlayer.addEventListener('canplay', () => {
    clearInterval(loadingInterval);
    loadingProgress.style.width = '100%';
    loadingPercent.textContent = '100%';
    setTimeout(() => {
      loadingBar.style.display = 'none';
    }, 500); // Hide after a short delay
    audioPlayer.play().catch(err => {
      console.error('Playback error:', err);
      alert('Failed to play audio. The video might be unavailable or restricted.');
    });
  }, { once: true });

  audioPlayer.addEventListener('error', () => {
    clearInterval(loadingInterval);
    loadingBar.style.display = 'none';
    alert('Failed to load audio stream.');
  }, { once: true });

  fetchHistory();
}

async function fetchHistory() {
  try {
    const response = await fetch('/history');
    const history = await response.json();
    displayHistory(history);
  } catch (error) {
    console.error('Error fetching history:', error);
  }
}

function displayHistory(history) {
  recentlyPlayedList.innerHTML = '';
  history.forEach(item => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `
      <p>${item.title}</p>
      <small>${new Date(item.timestamp).toLocaleString()}</small>
    `;
    historyItem.addEventListener('click', () => {
      playSong(item.videoId, item.title);
    });
    recentlyPlayedList.appendChild(historyItem);
  });
}

function toggleDropdown(btn, dropdown) {
  document.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.control-dropdown').forEach(d => d.classList.remove('active'));
  btn.classList.add('active');
  dropdown.classList.add('active');
}

recentlyPlayedBtn.addEventListener('click', () => {
  toggleDropdown(recentlyPlayedBtn, recentlyPlayedList);
  fetchHistory();
});

queueBtn.addEventListener('click', () => {
  toggleDropdown(queueBtn, queueList);
  queueList.innerHTML = '<p>Queue is empty for now.</p>';
});

sleepBtn.addEventListener('click', () => {
  toggleDropdown(sleepBtn, sleepOptions);
  if (!sleepOptions.children.length) {
    populateSleepOptions();
  }
});

function populateSleepOptions() {
  for (let i = 1; i <= 10; i++) {
    const option = document.createElement('div');
    option.className = 'sleep-option';
    option.textContent = `${i} hour${i > 1 ? 's' : ''}`;
    option.addEventListener('click', () => startSleepTimer(i * 60 * 60 * 1000));
    sleepOptions.appendChild(option);
  }
}

function startSleepTimer(milliseconds) {
  if (sleepTimer) clearInterval(sleepTimer);
  let timeLeft = milliseconds;
  sleepTimerDisplay.textContent = formatTime(timeLeft);
  sleepTimer = setInterval(() => {
    timeLeft -= 1000;
    if (timeLeft <= 0) {
      clearInterval(sleepTimer);
      audioPlayer.pause();
      sleepTimerDisplay.textContent = '';
      sleepTimer = null;
    } else {
      sleepTimerDisplay.textContent = formatTime(timeLeft);
    }
  }, 1000);
}

function formatTime(milliseconds) {
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

fetchHistory();
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const searchResults = document.getElementById('search-results');
const audioPlayer = document.getElementById('audio-player');
const recentlyPlayedBtn = document.getElementById('recently-played-btn');
const queueBtn = document.getElementById('queue-btn');
const sleepBtn = document.getElementById('sleep-btn');
const clientSideBtn = document.getElementById('client-side-btn');
const recentlyPlayedList = document.getElementById('recently-played-list');
const queueList = document.getElementById('queue-list');
const sleepOptions = document.getElementById('sleep-options');
const sleepTimerDisplay = document.getElementById('sleep-timer');
const loadingBar = document.getElementById('loading-bar');
const loadingProgress = document.querySelector('.loading-progress');
const loadingPercent = document.getElementById('loading-percent');
const currentTrack = document.getElementById('current-track');
const clearSearch = document.getElementById('clear-search');

let debounceTimer;
let loadingInterval = null;
let isClientSide = false;
let lastPlayedSongId = null;

function triggerSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const query = searchInput.value.trim();
    if (query) {
      fetchSearchResults(query);
      clearSearch.style.display = 'block';
    } else {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
      clearSearch.style.display = 'none';
    }
  }, 300);
}

searchInput.addEventListener('input', triggerSearch);
searchButton.addEventListener('click', (e) => {
  e.preventDefault();
  triggerSearch();
});

clearSearch.addEventListener('click', () => {
  searchInput.value = '';
  searchResults.innerHTML = '';
  searchResults.style.display = 'none';
  clearSearch.style.display = 'none';
});

async function fetchSearchResults(query) {
  try {
    const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Search failed');
    }
    displaySearchResults(data);
  } catch (error) {
    console.error('Error fetching search results:', error);
    alert('Search failed');
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
      <div class="result-item-buttons">
        <button class="queue-btn">Add to Queue</button>
        <button class="play-next-btn">Play Next</button>
      </div>
    `;
    item.querySelector('.queue-btn').addEventListener('click', (e) => {
      e.preventDefault();
      addToQueue(result.videoId, result.title, false);
    });
    item.querySelector('.play-next-btn').addEventListener('click', (e) => {
      e.preventDefault();
      addToQueue(result.videoId, result.title, true);
    });
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('queue-btn') && !e.target.classList.contains('play-next-btn')) {
        playSong(result.videoId, result.title, true);
        searchResults.style.display = 'none';
      }
    });
    searchResults.appendChild(item);
  });
  searchResults.style.display = 'block';
}

function playSong(videoId, title, updateHistory = false) {
  if (isClientSide) {
    const encodedTitle = encodeURIComponent(title);
    const streamUrl = `/stream/${videoId}?title=${encodedTitle}&updateHistory=${updateHistory}`;
    audioPlayer.src = streamUrl;
    audioPlayer.load();

    currentTrack.textContent = `Currently Playing: ${title}`;

    loadingBar.style.display = 'block';
    let progress = 0;
    loadingProgress.style.width = '0%';
    loadingPercent.textContent = '0%';

    if (loadingInterval) clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      progress += 2;
      if (progress >= 100) {
        progress = 100;
        clearInterval(loadingInterval);
      }
      loadingProgress.style.width = `${progress}%`;
      loadingPercent.textContent = `${progress}%`;
    }, 100);

    audioPlayer.addEventListener('canplay', () => {
      clearInterval(loadingInterval);
      loadingProgress.style.width = '100%';
      loadingPercent.textContent = '100%';
      setTimeout(() => {
        loadingBar.style.display = 'none';
      }, 500);
      audioPlayer.play().catch(err => {
        console.error('Playback error:', err);
        alert('Failed to play audio. The video might be unavailable or restricted.');
      });
    }, { once: true });

    audioPlayer.addEventListener('error', () => {
      clearInterval(loadingInterval);
      loadingBar.style.display = 'none';
      currentTrack.textContent = 'Currently Playing: Nothing';
      alert('Failed to load audio stream.');
    }, { once: true });

    audioPlayer.addEventListener('ended', playNextInQueue, { once: true });
    if (updateHistory) fetchHistory();
  } else {
    fetch('/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, title }),
    });
  }
}

async function addToQueue(videoId, title, playNext = false) {
  try {
    const response = await fetch('/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, title, playNext }),
    });
    const queue = await response.json();
    if (isClientSide) updateQueueDisplay(queue);
  } catch (error) {
    console.error('Error adding to queue:', error);
  }
}

async function playNextInQueue() {
  if (isClientSide) {
    try {
      const response = await fetch('/queue/remove-first', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const queue = await response.json();
      if (queue.length > 0) {
        const nextSong = queue[0];
        playSong(nextSong.videoId, nextSong.title, false);
        updateQueueDisplay(queue);
      } else {
        currentTrack.textContent = 'Currently Playing: Nothing';
      }
    } catch (error) {
      console.error('Error playing next in queue:', error);
    }
  } else {
    fetch('/song-ended', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function updateQueueDisplay(queue) {
  queueList.innerHTML = '';
  queue.forEach((item, index) => {
    const queueItem = document.createElement('div');
    queueItem.className = 'queue-item';
    if (index >= 3) {
      queueItem.classList.add('not-preloaded');
    }
    queueItem.innerHTML = `
      <p>${index + 1}. ${item.title}</p>
      <button class="remove-btn">Remove</button>
    `;
    queueItem.querySelector('.remove-btn').addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/queue/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      if (isClientSide) {
        const updatedQueue = await (await fetch('/queue')).json();
        updateQueueDisplay(updatedQueue);
      }
    });
    queueItem.addEventListener('click', async (e) => {
      if (!e.target.classList.contains('remove-btn')) {
        playSong(item.videoId, item.title, true);
        if (isClientSide) {
          await fetch('/queue/remove-first', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const updatedQueue = await (await fetch('/queue')).json();
          updateQueueDisplay(updatedQueue);
        }
      }
    });
    queueList.appendChild(queueItem);
  });
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
      playSong(item.videoId, item.title, true);
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
  fetch('/queue')
    .then(res => res.json())
    .then(queue => updateQueueDisplay(queue));
});

sleepBtn.addEventListener('click', (e) => {
  e.preventDefault();
  toggleDropdown(sleepBtn, sleepOptions);
  if (!sleepOptions.children.length) {
    populateSleepOptions();
  }
});

clientSideBtn.addEventListener('click', (e) => {
  e.preventDefault();
  isClientSide = !isClientSide;
  clientSideBtn.textContent = isClientSide ? 'Server Side' : 'Client Side';
  if (!isClientSide) {
    audioPlayer.pause();
    audioPlayer.src = '';
    syncAndPlayCurrentSong(); // Sync on mode switch to server-side
  }
});

function populateSleepOptions() {
  for (let i = 1; i <= 10; i++) {
    const option = document.createElement('div');
    option.className = 'sleep-option';
    option.textContent = `${i} hour${i > 1 ? 's' : ''}`;
    option.addEventListener('click', (e) => {
      e.preventDefault();
      if (isClientSide) {
        startSleepTimer(i * 60 * 60 * 1000);
      } else {
        fetch('/sleep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ milliseconds: i * 60 * 60 * 1000 }),
        });
      }
    });
    sleepOptions.appendChild(option);
  }
}

function startSleepTimer(milliseconds) {
  let timeLeft = milliseconds;
  sleepTimerDisplay.textContent = formatTime(timeLeft);
  const interval = setInterval(() => {
    timeLeft -= 1000;
    if (timeLeft <= 0) {
      clearInterval(interval);
      audioPlayer.pause();
      fetch('/queue/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then(() => {
        updateQueueDisplay([]);
        sleepTimerDisplay.textContent = '';
        currentTrack.textContent = 'Currently Playing: Nothing';
        window.location.reload();
      });
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

async function syncAndPlayCurrentSong() {
  try {
    const response = await fetch('/current-state');
    const { currentSong, elapsedTime, queue, sleepTimer } = await response.json();
    if (currentSong) {
      const encodedTitle = encodeURIComponent(currentSong.title);
      const streamUrl = `/stream/${currentSong.videoId}?title=${encodedTitle}&updateHistory=false`;
      audioPlayer.src = streamUrl;
      audioPlayer.load();
      audioPlayer.addEventListener('canplay', () => {
        audioPlayer.currentTime = elapsedTime; // Sync time once on load
        audioPlayer.play().catch(err => console.error('Playback error:', err));
        currentTrack.textContent = `Currently Playing: ${currentSong.title}`;
        lastPlayedSongId = currentSong.videoId;
      }, { once: true });
    } else {
      currentTrack.textContent = 'Currently Playing: Nothing';
    }
    updateQueueDisplay(queue);
    if (sleepTimer) {
      sleepTimerDisplay.textContent = formatTime(sleepTimer);
    } else {
      sleepTimerDisplay.textContent = '';
    }
  } catch (error) {
    console.error('Error syncing current song:', error);
  }
}

// Real-time updates via SSE
const eventSource = new EventSource('/events');
eventSource.onmessage = (event) => {
  const { currentSong, queue, sleepTimer } = JSON.parse(event.data);
  if (!isClientSide) {
    if (currentSong && currentSong.videoId !== lastPlayedSongId) {
      const encodedTitle = encodeURIComponent(currentSong.title);
      const streamUrl = `/stream/${currentSong.videoId}?title=${encodedTitle}&updateHistory=false`;
      audioPlayer.src = streamUrl;
      audioPlayer.load();
      audioPlayer.play().catch(err => console.error('Playback error:', err));
      currentTrack.textContent = `Currently Playing: ${currentSong.title}`;
      lastPlayedSongId = currentSong.videoId;
    } else if (!currentSong) {
      audioPlayer.pause();
      audioPlayer.src = '';
      currentTrack.textContent = 'Currently Playing: Nothing';
      lastPlayedSongId = null;
    }
    updateQueueDisplay(queue);
    if (sleepTimer) {
      sleepTimerDisplay.textContent = formatTime(sleepTimer);
    } else {
      sleepTimerDisplay.textContent = '';
    }
  }
};

audioPlayer.addEventListener('ended', () => {
  if (!isClientSide) {
    fetch('/song-ended', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Sync and play on page load in server-side mode
if (!isClientSide) {
  syncAndPlayCurrentSong();
}

fetchHistory();
fetch('/queue').then(res => res.json()).then(queue => updateQueueDisplay(queue));
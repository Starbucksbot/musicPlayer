let audioPlayer;
let currentVideoId = null;
let nextVideoId = null;
let isPlaying = false;
let history = { pinned: [], recent: [] };
let queue = [];
let isSleepMenuOpen = false;
const MAX_RETRIES = 3;
let lastSearchTime = null;
let sleepTimerId = null;
let sleepEndTime = null;
let continuousPlayStartTime = null;
const MAX_CONTINUOUS_PLAY_TIME = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
let abortController = null;
let searchTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
  audioPlayer = document.getElementById('audioPlayer');

  // Sync with server state
  async function syncWithServer() {
    if (abortController) return;
    try {
      const response = await fetch('/api/state');
      const state = await response.json();
      currentVideoId = state.currentVideoId;
      isPlaying = state.isPlaying;
      queue = state.queue;
      if (currentVideoId) {
        const albumArt = document.getElementById('albumArt');
        albumArt.src = `https://img.youtube.com/vi/${currentVideoId}/hqdefault.jpg`;
        albumArt.style.display = 'block';
        audioPlayer.src = `/api/audio?videoId=${currentVideoId}`;
        if (isPlaying) {
          audioPlayer.play();
          document.querySelector('.play-icon').style.display = 'none';
          document.querySelector('.pause-icon').style.display = 'block';
          if (!continuousPlayStartTime) {
            continuousPlayStartTime = Date.now();
          }
        } else {
          audioPlayer.pause();
          document.querySelector('.play-icon').style.display = 'block';
          document.querySelector('.pause-icon').style.display = 'none';
        }
      }
      fetchHistory();
      fetchQueue();
    } catch (err) {
      console.error('Error syncing with server:', err.message);
    }
  }

  // Poll server state for multi-user updates
  setInterval(syncWithServer, 5000);

  // Audio player events
  audioPlayer.addEventListener('timeupdate', updateProgress);
  audioPlayer.addEventListener('ended', playNext);
  audioPlayer.addEventListener('play', () => {
    isPlaying = true;
    document.querySelector('.play-icon').style.display = 'none';
    document.querySelector('.pause-icon').style.display = 'block';
    fetch('/api/resume', { method: 'POST' });
    if (!continuousPlayStartTime) {
      continuousPlayStartTime = Date.now();
    }
    checkContinuousPlayLimit();
    document.getElementById('loadingBar').style.display = 'none';
  });
  audioPlayer.addEventListener('pause', () => {
    isPlaying = false;
    document.querySelector('.play-icon').style.display = 'block';
    document.querySelector('.pause-icon').style.display = 'none';
    fetch('/api/pause', { method: 'POST' });
  });
  audioPlayer.addEventListener('loadstart', () => {
    document.getElementById('loadingBar').style.display = 'block';
    document.getElementById('loadingBar').value = 0;
  });
  audioPlayer.addEventListener('progress', () => {
    if (audioPlayer.buffered.length > 0) {
      const buffered = audioPlayer.buffered.end(0);
      const duration = audioPlayer.duration || 100;
      const bufferPercent = (buffered / duration) * 100;
      document.getElementById('loadingBar').value = bufferPercent;
      if (bufferPercent >= 10) { // Approximate first 10 seconds
        document.getElementById('loadingBar').style.display = 'none';
      }
    }
  });

  // Button event listeners
  document.getElementById('playButton').addEventListener('click', () => {
    if (!currentVideoId) return;
    if (isPlaying) {
      audioPlayer.pause();
    } else {
      audioPlayer.play();
    }
  });

  document.getElementById('prevButton').addEventListener('click', () => {
    if (!currentVideoId) return;
    const recent = history.recent.filter((item) => item.id !== currentVideoId);
    const prevItem = recent[recent.length - 1];
    if (prevItem) playAudio(prevItem.id, prevItem.title);
  });

  document.getElementById('nextButton').addEventListener('click', playNext);

  document.getElementById('sleepButton').addEventListener('click', () => {
    const queueTitle = document.getElementById('queueTitle');
    const queueList = document.getElementById('queueList');
    isSleepMenuOpen = !isSleepMenuOpen;
    if (isSleepMenuOpen) {
      queueTitle.textContent = 'Sleep Timer';
      queueList.innerHTML = '';
      queueList.classList.add('sleep-menu');
      const hours = [1, 2, 3, 4, 5, 6, 12];
      hours.forEach((hour) => {
        const div = document.createElement('div');
        div.textContent = `${hour} Hour${hour !== 1 ? 's' : ''}`;
        if (hour === 12) {
          div.classList.add('default');
        }
        div.addEventListener('click', () => {
          if (sleepTimerId) {
            clearTimeout(sleepTimerId);
            clearInterval(countdownInterval);
          }
          const sleepTime = hour * 60 * 60 * 1000;
          sleepEndTime = Date.now() + sleepTime;
          sleepTimerId = setTimeout(() => {
            audioPlayer.pause();
            sleepTimerId = null;
            sleepEndTime = null;
            document.getElementById('sleepCountdown').textContent = '';
            clearInterval(countdownInterval);
          }, sleepTime);
          if (hour !== 12) { // Exclude 12-hour timer from countdown
            countdownInterval = setInterval(updateSleepCountdown, 1000);
          }
          isSleepMenuOpen = false;
          fetchQueue();
        });
        queueList.appendChild(div);
      });
    } else {
      queueTitle.textContent = 'Queue';
      fetchQueue();
    }
  });

  document.getElementById('stopButton').addEventListener('click', () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }
    const searchSuggestions = document.getElementById('searchSuggestions');
    searchSuggestions.innerHTML = '<div>Requests stopped</div>';
    console.log('Stopped all ongoing requests and searches');
  });

  // Search functionality with debouncing
  const searchInput = document.getElementById('searchInput');
  const albumArt = document.getElementById('albumArt');
  const searchSuggestions = document.getElementById('searchSuggestions');

  searchInput.addEventListener('focus', () => {
    albumArt.style.display = 'none';
    searchSuggestions.classList.add('expanded');
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (currentVideoId) {
        albumArt.style.display = 'block';
      }
      searchSuggestions.classList.remove('expanded');
      searchSuggestions.style.display = 'none';
    }, 200);
  });

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value;
    if (!query) {
      searchSuggestions.innerHTML = '';
      return;
    }
    searchSuggestions.style.display = 'block';
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(async () => {
      lastSearchTime = Date.now();
      let retries = 0;
      while (retries < MAX_RETRIES) {
        try {
          abortController = new AbortController();
          const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
            signal: abortController.signal,
          });
          const results = await response.json();
          if (results.error) {
            console.error('Search suggestions failed:', results.error);
            searchSuggestions.innerHTML = '<div>Error fetching suggestions</div>';
            return;
          }
          searchSuggestions.innerHTML = '';
          results.slice(0, 5).forEach((song) => {
            const div = document.createElement('div');
            div.textContent = song.snippet.title;
            div.addEventListener('click', () => {
              playAudio(song.id.videoId, song.snippet.title);
              searchInput.value = '';
              searchSuggestions.style.display = 'none';
              showPlayerContent();
            });
            searchSuggestions.appendChild(div);
          });
          return;
        } catch (err) {
          if (err.name === 'AbortError') {
            console.log('Search suggestions aborted');
            return;
          }
          retries++;
          console.error(`Error fetching search suggestions (attempt ${retries}/${MAX_RETRIES}):`, err.message);
          if (retries === MAX_RETRIES) {
            searchSuggestions.innerHTML = '<div>Failed to fetch suggestions after 3 attempts</div>';
          }
        }
      }
    }, 500);
  });

  document.getElementById('searchButton').addEventListener('click', async () => {
    const query = searchInput.value;
    if (!query) return;
    lastSearchTime = Date.now();
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        abortController = new AbortController();
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: abortController.signal,
        });
        const results = await response.json();
        if (results.error) {
          console.error('Search failed:', results.error);
          alert('Failed to fetch search results: ' + (results.details?.message || 'Unknown error'));
          return;
        }
        const searchResultsDiv = document.getElementById('searchResults');
        searchResultsDiv.innerHTML = '';
        results.slice(0, 5).forEach((song) => {
          const div = document.createElement('div');
          const titleSpan = document.createElement('span');
          titleSpan.textContent = song.snippet.title;
          titleSpan.addEventListener('click', () => {
            playAudio(song.id.videoId, song.snippet.title);
            searchInput.value = '';
            searchResultsDiv.style.display = 'none';
            showPlayerContent();
          });
          const queueButton = document.createElement('button');
          queueButton.className = 'button queue-button';
          queueButton.textContent = 'Add to Queue';
          queueButton.addEventListener('click', async () => {
            await fetch('/api/add-to-queue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoId: song.id.videoId, title: song.snippet.title }),
            });
            fetchQueue();
          });
          div.appendChild(titleSpan);
          div.appendChild(queueButton);
          searchResultsDiv.appendChild(div);
        });
        searchResultsDiv.style.display = 'flex';
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('Search aborted');
          return;
        }
        retries++;
        console.error(`Error during search (attempt ${retries}/${MAX_RETRIES}):`, err.message);
        if (retries === MAX_RETRIES) {
          alert('Failed to fetch search results after 3 attempts');
        }
      }
    }
  });

  // Helper functions
  async function playAudio(videoId, title) {
    currentVideoId = videoId;
    audioPlayer.src = `/api/audio?videoId=${videoId}`;
    audioPlayer.play();
    const albumArt = document.getElementById('albumArt');
    albumArt.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    albumArt.style.display = 'block';
    await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, title }),
    });
    fetchHistory();
    fetchQueue();
  }

  async function playNext() {
    await fetch('/api/next', { method: 'POST' });
    syncWithServer();
    fetchQueue();
  }

  async function fetchHistory() {
    const response = await fetch('/api/history');
    const data = await response.json();
    history = data;
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    const allVideos = [...history.pinned, ...history.recent];
    for (const item of allVideos) {
      const div = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = item.title;
      span.addEventListener('click', () => playAudio(item.id, item.title));
      const button = document.createElement('button');
      button.className = 'button';
      if (history.pinned.some((p) => p.id === item.id)) {
        button.textContent = 'Unpin';
        button.addEventListener('click', async () => {
          await fetch('/api/unpin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: item.id }),
          });
          fetchHistory();
        });
      } else {
        button.textContent = 'Pin';
        button.addEventListener('click', async () => {
          await fetch('/api/pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: item.id }),
          });
          fetchHistory();
        });
      }
      div.appendChild(span);
      div.appendChild(button);
      historyList.appendChild(div);
    }
  }

  async function fetchQueue() {
    if (isSleepMenuOpen) return;
    const queueTitle = document.getElementById('queueTitle');
    const queueList = document.getElementById('queueList');
    queueTitle.textContent = 'Queue';
    queueList.classList.remove('sleep-menu');
    queueList.innerHTML = '';
    queue.forEach((item, index) => {
      const div = document.createElement('div');
      div.textContent = `Queue ${index + 1}: ${item.title}`;
      div.addEventListener('click', () => playAudio(item.id, item.title));
      queueList.appendChild(div);
      if (index === 0) nextVideoId = item.id;
    });

    // If queue is empty and there's a current song, add one suggestion
    if (queue.length === 0 && currentVideoId) {
      let retries = 0;
      while (retries < MAX_RETRIES) {
        try {
          const response = await fetch(`/api/related?videoId=${currentVideoId}`);
          const related = await response.json();
          if (related.error) {
            console.error(`Failed to fetch related videos for ${currentVideoId}:`, related.error);
            break;
          }
          if (related.length > 0) {
            const suggestion = related[0];
            await fetch('/api/add-to-queue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoId: suggestion.id.videoId, title: suggestion.snippet.title }),
            });
            queue.push({ id: suggestion.id.videoId, title: suggestion.snippet.title });
            const div = document.createElement('div');
            div.textContent = `Queue 1: ${suggestion.snippet.title}`;
            div.addEventListener('click', () => playAudio(suggestion.id.videoId, suggestion.snippet.title));
            queueList.appendChild(div);
            nextVideoId = suggestion.id.videoId;
          }
          break;
        } catch (err) {
          retries++;
          console.error(`Error fetching suggestion for ${currentVideoId} (attempt ${retries}/${MAX_RETRIES}):`, err.message);
          if (retries === MAX_RETRIES) {
            console.log(`Failed to fetch suggestion for ${currentVideoId} after 3 attempts`);
          }
        }
      }
    }
  }

  function updateProgress() {
    if (audioPlayer && isPlaying) {
      const current = audioPlayer.currentTime;
      const duration = audioPlayer.duration || 0;
      document.getElementById('currentTime').textContent = formatTime(current);
      document.getElementById('duration').textContent = formatTime(duration);
      document.getElementById('progressBar').value = duration ? (current / duration) * 100 : 0;
      setTimeout(updateProgress, 1000);
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function showPlayerContent() {
    document.getElementById('searchResults').style.display = 'none';
  }

  function checkContinuousPlayLimit() {
    if (!isPlaying || !continuousPlayStartTime) return;
    const elapsed = Date.now() - continuousPlayStartTime;
    if (elapsed >= MAX_CONTINUOUS_PLAY_TIME) {
      const timeSinceLastSearch = lastSearchTime ? Date.now() - lastSearchTime : Infinity;
      if (timeSinceLastSearch > MAX_CONTINUOUS_PLAY_TIME) {
        audioPlayer.pause();
        continuousPlayStartTime = null;
        console.log('Stopped playback after 12 hours of continuous play without new search');
        return;
      }
    }
    setTimeout(checkContinuousPlayLimit, 60000);
  }

  function updateSleepCountdown() {
    if (!sleepEndTime) return;
    const remainingTime = Math.max(0, sleepEndTime - Date.now());
    const hours = Math.floor(remainingTime / (60 * 60 * 1000));
    const minutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((remainingTime % (60 * 1000)) / 1000);
    document.getElementById('sleepCountdown').textContent = `${hours}h ${minutes}m ${seconds}s`;
  }

  let countdownInterval = null;
});
let audioPlayer;
let currentVideoId = null;
let nextVideoId = null;
let isPlaying = false;
let history = { pinned: [], recent: [] };
let suggestions = [];
let queue = [];
let isSleepMenuOpen = false;
const MAX_RETRIES = 3;

document.addEventListener('DOMContentLoaded', async () => {
  audioPlayer = document.getElementById('audioPlayer');

  // Sync with server state
  async function syncWithServer() {
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
        document.getElementById('playButton').textContent = 'Pause';
      } else {
        audioPlayer.pause();
        document.getElementById('playButton').textContent = 'Play';
      }
    }
    fetchHistory();
    fetchSuggestions();
  }

  // Poll server state for multi-user updates
  setInterval(syncWithServer, 5000);

  // Audio player events
  audioPlayer.addEventListener('timeupdate', updateProgress);
  audioPlayer.addEventListener('ended', playNext);
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
    const recent = history.recent.filter((id) => id !== currentVideoId);
    const prevVideoId = recent[recent.length - 1];
    if (prevVideoId) playAudio(prevVideoId);
  });

  document.getElementById('nextButton').addEventListener('click', playNext);

  document.getElementById('sleepButton').addEventListener('click', () => {
    const suggestionsTitle = document.getElementById('suggestionsTitle');
    const suggestionsList = document.getElementById('suggestionsList');
    isSleepMenuOpen = !isSleepMenuOpen;
    if (isSleepMenuOpen) {
      suggestionsTitle.textContent = 'Sleep Timer';
      suggestionsList.innerHTML = '';
      suggestionsList.classList.add('sleep-menu');
      for (let i = 1; i <= 12; i++) {
        const div = document.createElement('div');
        div.textContent = `${i} Hour${i > 1 ? 's' : ''}`;
        div.addEventListener('click', () => {
          setTimeout(() => audioPlayer.pause(), i * 3600000);
          isSleepMenuOpen = false;
          fetchSuggestions();
        });
        suggestionsList.appendChild(div);
      }
    } else {
      suggestionsTitle.textContent = 'Suggestions';
      fetchSuggestions();
    }
  });

  // Search functionality
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
    }, 200);
  });

  searchInput.addEventListener('input', async (e) => {
    const query = e.target.value;
    if (!query) {
      searchSuggestions.innerHTML = '';
      return;
    }
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
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
            playAudio(song.id.videoId);
            searchInput.value = '';
            searchSuggestions.innerHTML = '';
            showPlayerContent();
          });
          searchSuggestions.appendChild(div);
        });
        return;
      } catch (err) {
        retries++;
        console.error(`Error fetching search suggestions (attempt ${retries}/${MAX_RETRIES}):`, err.message);
        if (retries === MAX_RETRIES) {
          searchSuggestions.innerHTML = '<div>Failed to fetch suggestions after 3 attempts</div>';
        }
      }
    }
  });

  document.getElementById('searchButton').addEventListener('click', async () => {
    const query = searchInput.value;
    if (!query) return;
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
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
            playAudio(song.id.videoId);
            searchInput.value = '';
            showPlayerContent();
          });
          const queueButton = document.createElement('button');
          queueButton.className = 'button queue-button';
          queueButton.textContent = 'Add to Queue';
          queueButton.addEventListener('click', async () => {
            await fetch('/api/add-to-queue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ videoId: song.id.videoId }),
            });
            fetchSuggestions();
          });
          div.appendChild(titleSpan);
          div.appendChild(queueButton);
          searchResultsDiv.appendChild(div);
        });
        searchResultsDiv.style.display = 'flex';
        return;
      } catch (err) {
        retries++;
        console.error(`Error during search (attempt ${retries}/${MAX_RETRIES}):`, err.message);
        if (retries === MAX_RETRIES) {
          alert('Failed to fetch search results after 3 attempts');
        }
      }
    }
  });

  // Helper functions
  async function playAudio(videoId) {
    currentVideoId = videoId;
    audioPlayer.src = `/api/audio?videoId=${videoId}`;
    audioPlayer.play();
    const albumArt = document.getElementById('albumArt');
    albumArt.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    albumArt.style.display = 'block';
    await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    });
    fetchHistory();
    fetchSuggestions();
  }

  async function playNext() {
    await fetch('/api/next', { method: 'POST' });
    syncWithServer();
  }

  async function fetchHistory() {
    const response = await fetch('/api/history');
    const data = await response.json();
    history = data;
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    const allVideos = [...history.pinned, ...history.recent];
    for (const videoId of allVideos) {
      let retries = 0;
      while (retries < MAX_RETRIES) {
        try {
          const response = await fetch(`/api/video?videoId=${videoId}`);
          const video = await response.json();
          if (video.error) {
            console.error(`Failed to fetch video details for ${videoId}:`, video.error);
            break;
          }
          const title = video.snippet?.title || videoId;
          const div = document.createElement('div');
          const span = document.createElement('span');
          span.textContent = title;
          span.addEventListener('click', () => playAudio(videoId));
          const button = document.createElement('button');
          button.className = 'button';
          if (history.pinned.includes(videoId)) {
            button.textContent = 'Unpin';
            button.addEventListener('click', async () => {
              await fetch('/api/unpin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId }),
              });
              fetchHistory();
            });
          } else {
            button.textContent = 'Pin';
            button.addEventListener('click', async () => {
              await fetch('/api/pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId }),
              });
              fetchHistory();
            });
          }
          div.appendChild(span);
          div.appendChild(button);
          historyList.appendChild(div);
          break;
        } catch (err) {
          retries++;
          console.error(`Error fetching history video ${videoId} (attempt ${retries}/${MAX_RETRIES}):`, err.message);
          if (retries === MAX_RETRIES) {
            console.log(`Failed to fetch history video ${videoId} after 3 attempts`);
          }
        }
      }
    }
  }

  async function fetchSuggestions() {
    if (isSleepMenuOpen) return;
    const suggestionsTitle = document.getElementById('suggestionsTitle');
    const suggestionsList = document.getElementById('suggestionsList');
    suggestionsTitle.textContent = 'Suggestions';
    suggestionsList.classList.remove('sleep-menu');

    suggestionsList.innerHTML = '';
    const queuedSongs = [];
    for (const videoId of queue) {
      let retries = 0;
      while (retries < MAX_RETRIES) {
        try {
          const response = await fetch(`/api/video?videoId=${videoId}`);
          const video = await response.json();
          if (video.error) {
            console.error(`Failed to fetch queued video ${videoId}:`, video.error);
            break;
          }
          queuedSongs.push({ id: { videoId }, snippet: video.snippet });
          break;
        } catch (err) {
          retries++;
          console.error(`Error fetching queued video ${videoId} (attempt ${retries}/${MAX_RETRIES}):`, err.message);
          if (retries === MAX_RETRIES) {
            console.log(`Failed to fetch queued video ${videoId} after 3 attempts`);
          }
        }
      }
    }

    let newSuggestions = [];
    if (currentVideoId) {
      let retries = 0;
      while (retries < MAX_RETRIES) {
        try {
          const response = await fetch(`/api/related?videoId=${currentVideoId}`);
          const data = await response.json();
          if (data.error) {
            console.error(`Failed to fetch related videos for ${currentVideoId}:`, data.error);
            break;
          }
          newSuggestions = data;
          break;
        } catch (err) {
          retries++;
          console.error(`Error fetching related videos for ${currentVideoId} (attempt ${retries}/${MAX_RETRIES}):`, err.message);
          if (retries === MAX_RETRIES) {
            console.log(`Failed to fetch related videos for ${currentVideoId} after 3 attempts`);
          }
        }
      }
    }

    suggestions = [...queuedSongs, ...newSuggestions].slice(0, 10);
    suggestions.forEach((song, index) => {
      const div = document.createElement('div');
      div.textContent = (index < queue.length ? `Queue ${index + 1}: ` : '') + song.snippet.title;
      div.addEventListener('click', () => playAudio(song.id.videoId));
      suggestionsList.appendChild(div);
      if (index === 0) nextVideoId = song.id.videoId;
    });

    while (suggestions.length < 5 && currentVideoId) {
      let retries = 0;
      while (retries < MAX_RETRIES) {
        try {
          const response = await fetch(`/api/related?videoId=${currentVideoId}`);
          const moreSuggestions = await response.json();
          if (moreSuggestions.error) {
            console.error(`Failed to fetch more suggestions for ${currentVideoId}:`, moreSuggestions.error);
            break;
          }
          const newItems = moreSuggestions.filter(
            (item) => !suggestions.some((s) => s.id.videoId === item.id.videoId)
          );
          suggestions.push(...newItems.slice(0, 5 - suggestions.length));
          newItems.slice(0, 5 - suggestions.length).forEach((song, index) => {
            const div = document.createElement('div');
            div.textContent = song.snippet.title;
            div.addEventListener('click', () => playAudio(song.id.videoId));
            suggestionsList.appendChild(div);
            if (suggestions.length === 1) nextVideoId = song.id.videoId;
          });
          break;
        } catch (err) {
          retries++;
          console.error(`Error fetching more suggestions for ${currentVideoId} (attempt ${retries}/${MAX_RETRIES}):`, err.message);
          if (retries === MAX_RETRIES) {
            console.log(`Failed to fetch more suggestions for ${currentVideoId} after 3 attempts`);
          }
        }
      }
      break; // Avoid infinite loop if related videos fail
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
});
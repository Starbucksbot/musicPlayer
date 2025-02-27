let player;
let currentVideoId = 'dQw4w9WgXcQ';
let nextVideoId = null;
let isPlaying = false;
let history = { pinned: [], recent: [] };
let suggestions = [];
let isSleepMenuOpen = false;

document.addEventListener('DOMContentLoaded', () => {
  // Load YouTube Iframe API
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('youtube-player', {
      height: '0',
      width: '0',
      videoId: currentVideoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
      },
      events: {
        onReady: (event) => {
          updateProgress();
          fetchHistory();
          fetchSuggestions();
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING) {
            isPlaying = true;
            document.getElementById('playButton').textContent = 'Pause';
            updateProgress();
          } else if (event.data === YT.PlayerState.PAUSED) {
            isPlaying = false;
            document.getElementById('playButton').textContent = 'Play';
          } else if (event.data === YT.PlayerState.ENDED) {
            playNext();
          }
        },
      },
    });
  };

  // Button event listeners
  document.getElementById('playButton').addEventListener('click', () => {
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  });

  document.getElementById('prevButton').addEventListener('click', () => {
    const recent = history.recent.filter((id) => id !== currentVideoId);
    const prevVideoId = recent[recent.length - 1];
    if (prevVideoId) playVideo(prevVideoId);
  });

  document.getElementById('nextButton').addEventListener('click', playNext);

  document.getElementById('sleepButton').addEventListener('click', () => {
    const suggestionsPanel = document.getElementById('suggestionsPanel');
    isSleepMenuOpen = !isSleepMenuOpen;
    if (isSleepMenuOpen) {
      suggestionsPanel.innerHTML = ''; // Clear the suggestions panel
      suggestionsPanel.classList.add('sleep-menu');
      for (let i = 1; i <= 12; i++) {
        const div = document.createElement('div');
        div.textContent = `${i} Hour${i > 1 ? 's' : ''}`;
        div.addEventListener('click', () => {
          setTimeout(() => player.pauseVideo(), i * 3600000);
          isSleepMenuOpen = false;
          fetchSuggestions(); // Restore suggestions
        });
        suggestionsPanel.appendChild(div);
      }
    } else {
      fetchSuggestions(); // Restore suggestions
    }
  });

  // Search functionality
  document.getElementById('searchInput').addEventListener('input', async (e) => {
    const query = e.target.value;
    const suggestionsDiv = document.getElementById('searchSuggestions');
    if (!query) {
      suggestionsDiv.innerHTML = '';
      return;
    }
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await response.json();
    suggestionsDiv.innerHTML = '';
    results.slice(0, 7).forEach((song) => {
      const div = document.createElement('div');
      div.textContent = song.snippet.title;
      div.addEventListener('click', () => {
        playVideo(song.id.videoId);
        document.getElementById('searchInput').value = '';
        suggestionsDiv.innerHTML = '';
        showPlayerContent();
      });
      suggestionsDiv.appendChild(div);
    });
  });

  document.getElementById('searchButton').addEventListener('click', async () => {
    const query = document.getElementById('searchInput').value;
    if (!query) return;
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await response.json();
    const searchResultsDiv = document.getElementById('searchResults');
    searchResultsDiv.innerHTML = '';
    results.slice(0, 5).forEach((song) => {
      const div = document.createElement('div');
      div.textContent = song.snippet.title;
      div.addEventListener('click', () => {
        playVideo(song.id.videoId);
        document.getElementById('searchInput').value = '';
        showPlayerContent();
      });
      searchResultsDiv.appendChild(div);
    });
    document.getElementById('playerContent').style.display = 'none';
    searchResultsDiv.style.display = 'flex';
  });

  // Helper functions
  async function playVideo(videoId) {
    currentVideoId = videoId;
    player.loadVideoById(videoId);
    document.getElementById('albumArt').src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    });
    fetchHistory();
    fetchSuggestions();
  }

  function playNext() {
    if (nextVideoId) {
      playVideo(nextVideoId);
    }
  }

  async function fetchHistory() {
    const response = await fetch('/api/history');
    const data = await response.json();
    history = data;
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    const allVideos = [...history.pinned, ...history.recent];
    for (const videoId of allVideos) {
      const response = await fetch(`/api/video?videoId=${videoId}`);
      const video = await response.json();
      const title = video.snippet?.title || videoId;
      const div = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = title;
      span.addEventListener('click', () => playVideo(videoId));
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
    }
  }

  async function fetchSuggestions() {
    if (isSleepMenuOpen) return; // Skip if sleep menu is open
    const suggestionsPanel = document.getElementById('suggestionsPanel');
    suggestionsPanel.innerHTML = '<h2>Suggestions</h2><div id="suggestionsList"></div>';
    suggestionsPanel.classList.remove('sleep-menu');
    const response = await fetch(`/api/related?videoId=${currentVideoId}`);
    suggestions = await response.json();
    const suggestionsList = document.getElementById('suggestionsList');
    suggestionsList.innerHTML = '';
    suggestions.forEach((song, index) => {
      const div = document.createElement('div');
      div.textContent = (index === 0 ? 'Next: ' : '') + song.snippet.title;
      div.addEventListener('click', () => playVideo(song.id.videoId));
      suggestionsList.appendChild(div);
      if (index === 0) nextVideoId = song.id.videoId;
    });
  }

  function updateProgress() {
    if (player && player.getCurrentTime) {
      const current = player.getCurrentTime();
      const duration = player.getDuration();
      document.getElementById('currentTime').textContent = formatTime(current);
      document.getElementById('duration').textContent = formatTime(duration);
      document.getElementById('progressBar').value = (current / duration) * 100 || 0;
      if (isPlaying) setTimeout(updateProgress, 1000);
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function showPlayerContent() {
    document.getElementById('playerContent').style.display = 'block';
    document.getElementById('searchResults').style.display = 'none';
  }
});
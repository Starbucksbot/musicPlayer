let player;
let currentVideoId = null; // No default song
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
    if (!currentVideoId) return; // Do nothing if no video is selected
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  });

  document.getElementById('prevButton').addEventListener('click', () => {
    if (!currentVideoId) return;
    const recent = history.recent.filter((id) => id !== currentVideoId);
    const prevVideoId = recent[recent.length - 1];
    if (prevVideoId) playVideo(prevVideoId);
  });

  document.getElementById('nextButton').addEventListener('click', playNext);

  document.getElementById('sleepButton').addEventListener('click', () => {
    const suggestionsPanel = document.getElementById('suggestionsPanel');
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
          setTimeout(() => player.pauseVideo(), i * 3600000);
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
    albumArt.style.display = 'none'; // Hide album art when search is focused
    searchSuggestions.classList.add('expanded'); // Expand suggestions
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (currentVideoId) {
        albumArt.style.display = 'block'; // Restore album art if a video is playing
      }
      searchSuggestions.classList.remove('expanded'); // Shrink suggestions
    }, 200); // Delay to allow clicking a suggestion
  });

  searchInput.addEventListener('input', async (e) => {
    const query = e.target.value;
    if (!query) {
      searchSuggestions.innerHTML = '';
      return;
    }
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const results = await response.json();
    searchSuggestions.innerHTML = '';
    results.slice(0, 5).forEach((song) => {
      const div = document.createElement('div');
      div.textContent = song.snippet.title;
      div.addEventListener('click', () => {
        playVideo(song.id.videoId);
        searchInput.value = '';
        searchSuggestions.innerHTML = '';
        showPlayerContent();
      });
      searchSuggestions.appendChild(div);
    });
  });

  document.getElementById('searchButton').addEventListener('click', async () => {
    const query = searchInput.value;
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
        searchInput.value = '';
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
    const albumArt = document.getElementById('albumArt');
    albumArt.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    albumArt.style.display = 'block'; // Show album art when a video is playing
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
    if (isSleepMenuOpen) return;
    const suggestionsTitle = document.getElementById('suggestionsTitle');
    const suggestionsList = document.getElementById('suggestionsList');
    suggestionsTitle.textContent = 'Suggestions';
    suggestionsList.classList.remove('sleep-menu');
    const response = await fetch(`/api/related?videoId=${currentVideoId}`);
    suggestions = await response.json();
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
    if (player && player.getCurrentTime && isPlaying) {
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
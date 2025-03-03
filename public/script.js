const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const searchResults = document.getElementById('search-results');
const audioPlayer = document.getElementById('audio-player');
const historyList = document.getElementById('history-list');

let debounceTimer;

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
  audioPlayer.src = `/stream/${videoId}?title=${encodedTitle}`;
  audioPlayer.play().catch(err => console.error('Playback error:', err));
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
  historyList.innerHTML = '';
  history.forEach(item => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `
      <p>${item.title}</p>
      <small>${new Date(item.timestamp).toLocaleString()}</small>
    `;
    historyList.appendChild(historyItem);
  });
}

fetchHistory();
const audioPlayer = document.getElementById('player');
const searchInput = document.getElementById('searchInput');
const resultDiv = document.querySelector('.track-info');
const recentSongsList = document.getElementById('recent-songs');
const nextSongDiv = document.getElementById('next-song');
const playBtn = document.querySelector('.play-btn');
const prevBtn = document.querySelector('.control-btn:nth-child(1)');
const nextBtn = document.querySelector('.control-btn:nth-child(3)');
const progress = document.querySelector('.progress');
const timeDisplay = document.querySelector('.time');
const volumeBtn = document.querySelector('.volume-btn');
const volumeSlider = document.querySelector('.volume-slider');
const sleepBtn = document.querySelector('.sleep-btn');
const sleepOptions = document.getElementById('sleep-options');
const sleepTimeSelect = document.getElementById('sleep-time');

let nextTrack = null;
let currentTrack = null;
let sleepTimer = null;
let isPlaying = false;
let isMuted = false;

audioPlayer.volume = 1; // Default volume
console.log('Client script loaded');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded');

    if (!searchInput) console.error('searchInput not found');
    if (!playBtn) console.error('playBtn not found');
    if (!prevBtn) console.error('prevBtn not found');
    if (!nextBtn) console.error('nextBtn not found');
    if (!volumeBtn) console.error('volumeBtn not found');
    if (!sleepBtn) console.error('sleepBtn not found');

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') search();
    });
    document.querySelector('.search-btn').addEventListener('click', search);
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', previousTrack);
    nextBtn.addEventListener('click', nextTrack);
    volumeBtn.addEventListener('click', toggleVolume);
    sleepBtn.addEventListener('click', toggleSleepOptions);
    document.querySelector('.sleep-options button').addEventListener('click', setSleepTimer);
    volumeSlider.addEventListener('input', (e) => {
        audioPlayer.volume = e.target.value;
    });

    loadRecentSongs();
    updateProgress();
});

async function search() {
    console.log('Search function called');
    const query = searchInput.value.trim();
    if (!query) {
        resultDiv.textContent = 'Please enter a search term';
        return;
    }

    resultDiv.textContent = 'Searching...';
    try {
        const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        console.log('Search response:', data);
        if (data.results && data.results.length > 0) {
            displayResults(data.results);
        } else {
            resultDiv.textContent = 'No results found';
        }
    } catch (error) {
        console.error('Search error:', error);
        resultDiv.textContent = 'Error searching. Check console for details.';
    }
}

function displayResults(results) {
    resultDiv.innerHTML = '';
    if (!results || results.length === 0) {
        resultDiv.textContent = 'No results found';
        return;
    }
    results.forEach(result => {
        const div = document.createElement('div');
        div.textContent = result.title;
        div.onclick = () => playTrack(result.url, result.title);
        div.style.cursor = 'pointer';
        div.style.margin = '5px 0';
        resultDiv.appendChild(div);
    });
}

async function playTrack(url, title) {
    console.log('Play function called with URL:', url);
    if (!url) {
        resultDiv.textContent = 'No valid URL to play';
        return;
    }
    if (sleepTimer) {
        clearTimeout(sleepTimer);
        setSleepTimer();
    }
    currentTrack = { url, title };
    audioPlayer.src = `/stream?url=${encodeURIComponent(url)}`;
    isPlaying = true;
    playBtn.innerHTML = '<i class="fa fa-pause"></i>';
    try {
        await audioPlayer.play();
        resultDiv.textContent = `Now Playing: ${title}`;
        updateProgress();
    } catch (error) {
        console.error('Playback error:', error);
        resultDiv.textContent = 'Error playing track. Check console for details.';
    }
    await queueNextTrack();
}

function togglePlay() {
    console.log('Toggle Play clicked');
    if (isPlaying) {
        audioPlayer.pause();
        isPlaying = false;
        playBtn.innerHTML = '<i class="fa fa-play"></i>';
    } else if (currentTrack) {
        audioPlayer.play();
        isPlaying = true;
        playBtn.innerHTML = '<i class="fa fa-pause"></i>';
    }
}

function previousTrack() {
    console.log('Previous Track clicked');
    // Placeholder: Implement history if needed
    resultDiv.textContent = 'Previous not implemented';
}

function nextTrack() {
    console.log('Next Track clicked');
    if (nextTrack) {
        playTrack(nextTrack.url, nextTrack.title);
    } else {
        resultDiv.textContent = 'No next track available';
    }
}

function updateProgress() {
    const interval = setInterval(() => {
        if (audioPlayer.src && !isNaN(audioPlayer.duration)) {
            const progressPercent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progress.style.width = `${progressPercent}%`;
            const currentTime = formatTime(audioPlayer.currentTime);
            const duration = formatTime(audioPlayer.duration);
            timeDisplay.textContent = `${currentTime} / ${duration}`;
        }
        if (audioPlayer.ended) {
            clearInterval(interval);
            if (nextTrack) nextTrack();
        }
    }, 1000);
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function toggleVolume() {
    console.log('Volume clicked');
    isMuted = !isMuted;
    audioPlayer.muted = isMuted;
    volumeBtn.innerHTML = isMuted ? '<i class="fa fa-volume-mute"></i>' : '<i class="fa fa-volume-up"></i>';
    volumeSlider.classList.toggle('active');
}

function toggleSleepOptions() {
    console.log('Sleep clicked');
    sleepOptions.classList.toggle('active');
}

function setSleepTimer() {
    console.log('Set Sleep clicked');
    const hours = parseInt(sleepTimeSelect.value);
    const milliseconds = hours * 60 * 60 * 1000;
    sleepOptions.classList.remove('active');
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
        audioPlayer.pause();
        audioPlayer.src = '';
        resultDiv.textContent = 'Sleep timer ended. Restart to play.';
        nextTrack = null;
        nextSongDiv.textContent = 'No next track';
        isPlaying = false;
        playBtn.innerHTML = '<i class="fa fa-play"></i>';
    }, milliseconds);
    console.log(`Sleep timer set for ${hours} hours`);
}

async function queueNextTrack() {
    try {
        const recResponse = await fetch('/recommend');
        if (!recResponse.ok) throw new Error('Network response was not ok');
        const recData = await recResponse.json();
        if (recData.url && recData.title) {
            nextTrack = { url: recData.url, title: recData.title };
            nextSongDiv.textContent = `Next: ${nextTrack.title}`;
            predownloadTrack(recData.url);
        } else {
            nextSongDiv.textContent = 'No next track';
            nextTrack = null;
        }
    } catch (error) {
        nextSongDiv.textContent = 'Error getting next track';
        nextTrack = null;
        console.error('Recommendation error:', error);
    }

    audioPlayer.onended = () => {
        if (nextTrack) {
            playTrack(nextTrack.url, nextTrack.title);
        } else {
            resultDiv.textContent = 'Playback ended';
        }
    };
}

async function predownloadTrack(url) {
    try {
        const response = await fetch(`/stream?url=${encodeURIComponent(url)}`, {
            headers: { Range: 'bytes=0-163840' }
        });
        if (!response.ok) throw new Error('Predownload failed');
        const blob = await response.blob();
        console.log('Predownloaded 10 seconds of:', url);
    } catch (error) {
        console.error('Predownload failed:', error);
    }
}

async function loadRecentSongs() {
    try {
        const response = await fetch('/recent');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        recentSongsList.innerHTML = '';
        data.forEach(song => {
            const li = document.createElement('li');
            li.textContent = song.title || song.query;
            li.onclick = () => playTrack(song.url, song.title || song.query);
            recentSongsList.appendChild(li);
        });
    } catch (error) {
        recentSongsList.innerHTML = '<li>Error loading recent songs</li>';
        console.error('Recent songs error:', error);
    }
}
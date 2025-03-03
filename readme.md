# YouTube Audio Streamer

A web-based audio streaming application that plays YouTube audio content with server-side queue management, history tracking, and client-side playback options. Built with Node.js, Express, yt-dlp, and a browser frontend.

## Features

- **Server-Side Queue**: Manage a shared queue across all server-side clients, updated in real-time via Server-Sent Events (SSE).
- **Server-Side History**: Tracks up to 10 recently played songs, stored server-side with cached audio files.
- **Client-Side Toggle**: Switch between server-side (shared playback) and client-side (local playback) modes using the "Client Side" button.
- **Song Sync on Load**: New clients in server-side mode sync to the current song’s elapsed time on page load and auto-play.
- **Queue Autoplay**: Automatically plays the next song in the queue when the current one ends, removing the playing song to prevent looping.
- **Sleep Timer**: Server-side sleep timer clears the queue and stops playback after a set duration (1-10 hours).
- **Caching**: Pre-downloads up to 3 queued songs and caches recently played songs (up to 10) in `cache/`.
- **Red Music Icon**: Custom red music note favicon for the browser tab.
- **No Reloading**: Prevents page refreshes when adding to the queue or setting the sleep timer.

## Prerequisites

- **[Node.js](https://nodejs.org/)**: v16.x or higher
- **[npm](https://www.npmjs.com/)**: For installing dependencies
- **[Python](https://www.python.org/)**: For yt-dlp (used for streaming and downloading)
- **[pm2](https://pm2.keymetrics.io/)**: For process management (optional but recommended)
- **[YouTube Data API Key](https://developers.google.com/youtube/v3)**: For search functionality (optional, falls back to yt-dlp if quota exceeded)

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Starbucksbot/musicPlayer.git
   cd musicPlayer
2. **Install Node Dependencies**:
   ```bash
    npm install
3. **Install yt-dlp**:
      ```bash
    pip install yt-dlp
4. **Set Up Environment**:
    Fill in ecosystem.json file
       ```bash
    PORT=3000
    API_KEY=<your-youtube-api-key>
    
- Replace <your-youtube-api-key> with your YouTube Data API key (optional).

## Usage

1. **Start the Server**:

With npm: npm start
With pm2 (recommended): pm2 start ecosystem.json

2. **Access the Application**:

Open a browser to http://localhost:3000 (or your server’s IP if hosted remotely).
-- or whichever port you set in ecosystem


## Features in Action:

- **Search**: Type a query in the search bar and press Enter or click "Search" to find YouTube audio.
- **Play**: Click a search result to play it immediately, or use "Add to Queue" or "Play Next" to manage the queue.
- **Queue**: View and manage the queue via the "Queue" button. Click "Remove" to delete a song.
- **History**: See the last 10 played songs under "Recently Played".
- **Sleep Timer**: Click "Sleep" and select a duration (1-10 hours) to stop playback after that time.
- **Client-Side Mode**: Toggle to "Client Side" for local playback; toggle back to "Server Side" to sync with the server.
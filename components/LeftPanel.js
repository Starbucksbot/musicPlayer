import { useEffect } from 'react';
import { usePlayer } from './PlayerContext';
import styles from '../styles/LeftPanel.module.css';

export default function LeftPanel({ history, setHistory }) {
  const { play } = usePlayer();

  useEffect(() => {
    fetch('http://localhost:4300/history')
      .then((res) => res.json())
      .then((data) => setHistory(data))
      .catch((err) => console.error('Failed to fetch history:', err));
  }, []);

  const playSong = (videoId) => {
    fetch('http://localhost:4300/play', {
      method: 'POST',
      body: JSON.stringify({ videoId }),
      headers: { 'Content-Type': 'application/json' },
    }).then(() => {
      play(videoId);
      fetch('http://localhost:4300/history')
        .then((res) => res.json())
        .then((data) => setHistory(data));
    });
  };

  const pinSong = (videoId) =>
    fetch('http://localhost:4300/pin', {
      method: 'POST',
      body: JSON.stringify({ videoId }),
      headers: { 'Content-Type': 'application/json' },
    }).then(() => {
      fetch('http://localhost:4300/history')
        .then((res) => res.json())
        .then((data) => setHistory(data));
    });

  const unpinSong = (videoId) =>
    fetch('http://localhost:4300/unpin', {
      method: 'POST',
      body: JSON.stringify({ videoId }),
      headers: { 'Content-Type': 'application/json' },
    }).then(() => {
      fetch('http://localhost:4300/history')
        .then((res) => res.json())
        .then((data) => setHistory(data));
    });

  // Fetch song titles for display
  const fetchSongTitle = async (videoId) => {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.NEXT_PUBLIC_YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    return data.items[0]?.snippet.title || videoId;
  };

  useEffect(() => {
    const updateTitles = async () => {
      const updatedPinned = await Promise.all(
        history.pinned.map(async (videoId) => ({
          videoId,
          title: await fetchSongTitle(videoId),
        }))
      );
      const updatedRecent = await Promise.all(
        history.recent.map(async (videoId) => ({
          videoId,
          title: await fetchSongTitle(videoId),
        }))
      );
      setHistory({
        pinned: updatedPinned,
        recent: updatedRecent,
      });
    };
    if (history.pinned.length || history.recent.length) {
      updateTitles();
    }
  }, [history.pinned.length, history.recent.length]);

  return (
    <div className={`${styles.panel} glass`}>
      <h2>History</h2>
      {history.pinned.map((song) => (
        <div key={song.videoId}>
          <span onClick={() => playSong(song.videoId)} style={{ cursor: 'pointer' }}>
            {song.title}
          </span>
          <button onClick={() => unpinSong(song.videoId)} className="button">
            Unpin
          </button>
        </div>
      ))}
      {history.recent.map((song) => (
        <div key={song.videoId}>
          <span onClick={() => playSong(song.videoId)} style={{ cursor: 'pointer' }}>
            {song.title}
          </span>
          <button onClick={() => pinSong(song.videoId)} className="button">
            Pin
          </button>
        </div>
      ))}
    </div>
  );
}
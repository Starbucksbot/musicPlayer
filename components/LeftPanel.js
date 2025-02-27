import { useEffect } from 'react'; // No useState here, but verify
import styles from '../styles/LeftPanel.module.css';

export default function LeftPanel({ history, setHistory }) {
  useEffect(() => {
    fetch('http://localhost:4300/history') // Updated to backend server
      .then((res) => res.json())
      .then((data) => setHistory(data));
  }, []);

  const playSong = (videoId) => {
    fetch('http://localhost:4300/play', {
      method: 'POST',
      body: JSON.stringify({ videoId, title: 'Song' }),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const pinSong = (videoId) =>
    fetch('http://localhost:4300/pin', {
      method: 'POST',
      body: JSON.stringify({ videoId }),
      headers: { 'Content-Type': 'application/json' },
    });

  const unpinSong = (videoId) =>
    fetch('http://localhost:4300/unpin', {
      method: 'POST',
      body: JSON.stringify({ videoId }),
      headers: { 'Content-Type': 'application/json' },
    });

  return (
    <div className={`${styles.panel} glass`}>
      <h2>History</h2>
      {history.pinned.map((song) => (
        <div key={song}>
          {song}{' '}
          <button onClick={() => unpinSong(song)} className="button">
            Unpin
          </button>
        </div>
      ))}
      {history.recent.map((song) => (
        <div key={song}>
          {song}{' '}
          <button onClick={() => pinSong(song)} className="button">
            Pin
          </button>
        </div>
      ))}
    </div>
  );
}
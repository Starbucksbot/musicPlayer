import { useEffect } from 'react';
import styles from '../styles/LeftPanel.module.css';

export default function LeftPanel({ history, setHistory }) {
  useEffect(() => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => setHistory(data));
  }, []);

  const playSong = (videoId) => {
    fetch('/api/play', { method: 'POST', body: JSON.stringify({ videoId, title: 'Song' }) });
    // Update player here
  };

  const pinSong = (videoId) => fetch('/api/pin', { method: 'POST', body: JSON.stringify({ videoId }) });
  const unpinSong = (videoId) => fetch('/api/unpin', { method: 'POST', body: JSON.stringify({ videoId }) });

  return (
    <div className={`${styles.panel} glass`}>
      <h2>History</h2>
      {history.pinned.map(song => (
        <div key={song}>
          {song} <button onClick={() => unpinSong(song)} className="button">Unpin</button>
        </div>
      ))}
      {history.recent.map(song => (
        <div key={song}>
          {song} <button onClick={() => pinSong(song)} className="button">Pin</button>
        </div>
      ))}
    </div>
  );
}
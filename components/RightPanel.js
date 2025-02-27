import { useState, useEffect } from 'react';
import { usePlayer } from './PlayerContext';
import styles from '../styles/RightPanel.module.css';

export default function RightPanel({ setNextVideoId }) {
  const { currentVideoId } = usePlayer();
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (currentVideoId) {
      fetch(`http://localhost:4300/related?videoId=${currentVideoId}`)
        .then((res) => res.json())
        .then((data) => {
          setSuggestions(data);
          setNextVideoId(data[0]?.id.videoId);
        })
        .catch((err) => console.error('Failed to fetch related videos:', err));
    }
  }, [currentVideoId]);

  return (
    <div className={`${styles.panel} glass`}>
      <h2>Suggestions</h2>
      {suggestions.map((song, index) => (
        <div key={song.id.videoId}>
          {index === 0 ? 'Next: ' : ''}{song.snippet.title}
        </div>
      ))}
    </div>
  );
}
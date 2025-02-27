import { useState, useEffect } from 'react'; // Must import React
import styles from '../styles/RightPanel.module.css';

export default function RightPanel({ currentVideoId, setNextVideoId }) {
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (currentVideoId) {
      fetch(`http://localhost:4300/related?videoId=${currentVideoId}`)
        .then((res) => res.json())
        .then((data) => {
          setSuggestions(data);
          setNextVideoId(data[0]?.id.videoId);
        });
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
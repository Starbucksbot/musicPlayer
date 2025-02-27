import { useState } from 'react';
import { usePlayer } from './PlayerContext';
import styles from '../styles/SearchBar.module.css';

export default function SearchBar() {
  const { setVideo } = usePlayer();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const handleSearch = (e) => {
    const value = e.target.value;
    setQuery(value);
    if (value) {
      fetch(`http://localhost:4300/search?q=${value}`)
        .then((res) => res.json())
        .then((data) => setSuggestions(data.slice(0, 7)))
        .catch((err) => console.error('Failed to fetch search results:', err));
    } else {
      setSuggestions([]);
    }
  };

  return (
    <div className={styles.searchContainer}>
      <input
        type="text"
        value={query}
        onChange={handleSearch}
        placeholder="Search YouTube music..."
        className={`${styles.searchInput} glass`}
      />
      {suggestions.length > 0 && (
        <div className={`${styles.suggestions} glass`}>
          {suggestions.map((song) => (
            <div
              key={song.id.videoId}
              onClick={() => {
                setVideo(song.id.videoId);
                setQuery('');
                setSuggestions([]);
              }}
            >
              {song.snippet.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
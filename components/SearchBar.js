import { useState } from 'react';
import styles from '../styles/SearchBar.module.css';

export default function SearchBar({ setCurrentVideoId }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const handleSearch = (e) => {
    const value = e.target.value;
    setQuery(value);
    if (value) {
      fetch(`/api/search?q=${value}`)
        .then(res => res.json())
        .then(data => setSuggestions(data.slice(0, 7)));
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
          {suggestions.map(song => (
            <div
              key={song.id.videoId}
              onClick={() => {
                setCurrentVideoId(song.id.videoId);
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
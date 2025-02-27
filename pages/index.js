import { useState, useEffect } from 'react'; // Ensure React hooks are imported
import { PlayerProvider } from '../components/PlayerContext';
import LeftPanel from '../components/LeftPanel';
import MiddlePanel from '../components/MiddlePanel';
import RightPanel from '../components/RightPanel';
import SearchBar from '../components/SearchBar';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [nextVideoId, setNextVideoId] = useState(null);
  const [history, setHistory] = useState({ pinned: [], recent: [] });

  const playerControls = {
    play: (videoId) => setCurrentVideoId(videoId),
    pause: () => console.log('Pause'), // Placeholder
  };

  return (
    <PlayerProvider value={playerControls}>
      <div className={styles.container}>
        <LeftPanel history={history} setHistory={setHistory} />
        <MiddlePanel currentVideoId={currentVideoId} />
        <RightPanel currentVideoId={currentVideoId} setNextVideoId={setNextVideoId} />
        <SearchBar setCurrentVideoId={setCurrentVideoId} />
      </div>
    </PlayerProvider>
  );
}
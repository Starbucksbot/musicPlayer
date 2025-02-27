import { useState, useEffect } from 'react';
import { PlayerProvider } from '../components/PlayerContext';
import LeftPanel from '../components/LeftPanel';
import MiddlePanel from '../components/MiddlePanel';
import RightPanel from '../components/RightPanel';
import SearchBar from '../components/SearchBar';
import styles from '../styles/Home.module.css';

export default function Home() {
  const [history, setHistory] = useState({ pinned: [], recent: [] });
  const [nextVideoId, setNextVideoId] = useState(null);

  return (
    <PlayerProvider>
      <div className={styles.container}>
        <LeftPanel history={history} setHistory={setHistory} />
        <MiddlePanel />
        <RightPanel setNextVideoId={setNextVideoId} />
        <SearchBar />
      </div>
    </PlayerProvider>
  );
}
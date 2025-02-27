import { useState, useEffect, useContext } from 'react';
import PlayerContext from './PlayerContext';
import styles from '../styles/MiddlePanel.module.css';

export default function MiddlePanel({ currentVideoId }) {
  const { play, pause } = useContext(PlayerContext);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);

  const togglePlay = () => {
    if (isPlaying) pause(); else play(currentVideoId);
    setIsPlaying(!isPlaying);
  };

  return (
    <div className={`${styles.panel} glass`}>
      <img src={`https://img.youtube.com/vi/${currentVideoId}/hqdefault.jpg`} alt="Album Art" className={styles.albumArt} />
      <div className={styles.controls}>
        <button className={`${styles.controlButton} button`}>Prev</button>
        <button onClick={togglePlay} className={`${styles.playButton} button`}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button className={`${styles.controlButton} button`}>Next</button>
        <button onClick={() => setSleepOpen(!sleepOpen)} className={`${styles.sleepButton} button`}>Sleep</button>
        {sleepOpen && (
          <div className={styles.sleepMenu}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(hours => (
              <div key={hours} onClick={() => setTimeout(() => pause(), hours * 3600000)}>
                {hours} Hour{hours > 1 ? 's' : ''}
              </div>
            ))}
          </div>
        )}
      </div>
      <progress value="50" max="100" className={styles.progress}></progress>
    </div>
  );
}
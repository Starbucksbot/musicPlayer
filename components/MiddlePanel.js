import { useState, useEffect } from 'react';
import { usePlayer } from './PlayerContext';
import styles from '../styles/MiddlePanel.module.css';

export default function MiddlePanel() {
  const { play, pause, isPlaying, currentTime, duration, currentVideoId } = usePlayer();
  const [sleepOpen, setSleepOpen] = useState(false);

  const togglePlay = () => {
    if (isPlaying) {
      pause();
    } else {
      play(currentVideoId);
    }
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className={`${styles.panel} glass`}>
      <img
        src={`https://img.youtube.com/vi/${currentVideoId || 'dQw4w9WgXcQ'}/hqdefault.jpg`}
        alt="Album Art"
        className={styles.albumArt}
      />
      <div className={styles.controls}>
        <button className={`${styles.controlButton} button`}>Prev</button>
        <button onClick={togglePlay} className={`${styles.playButton} button`}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button className={`${styles.controlButton} button`}>Next</button>
        <button onClick={() => setSleepOpen(!sleepOpen)} className={`${styles.sleepButton} button`}>
          Sleep
        </button>
        {sleepOpen && (
          <div className={styles.sleepMenu}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((hours) => (
              <div
                key={hours}
                onClick={() => {
                  setTimeout(() => pause(), hours * 3600000);
                  setSleepOpen(false);
                }}
              >
                {hours} Hour{hours > 1 ? 's' : ''}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={styles.progressContainer}>
        <span>{formatTime(currentTime)}</span>
        <progress value={progress} max="100" className={styles.progress}></progress>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
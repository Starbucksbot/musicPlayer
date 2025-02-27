import { createContext, useContext, useState, useEffect } from 'react';

const PlayerContext = createContext();

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within a PlayerProvider');
  return context;
}

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      const ytPlayer = new window.YT.Player('youtube-player', {
        height: '0', // Invisible player, we control UI manually
        width: '0',
        videoId: currentVideoId || 'dQw4w9WgXcQ',
        playerVars: {
          autoplay: 0,
          controls: 0,
        },
        events: {
          onReady: (event) => {
            setPlayer(event.target);
            setDuration(event.target.getDuration());
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              const updateTime = () => {
                if (ytPlayer && ytPlayer.getCurrentTime) {
                  setCurrentTime(ytPlayer.getCurrentTime());
                  setTimeout(updateTime, 1000);
                }
              };
              updateTime();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            }
          },
        },
      });
    };

    return () => {
      delete window.onYouTubeIframeAPIReady;
    };
  }, []);

  useEffect(() => {
    if (player && currentVideoId) {
      player.loadVideoById(currentVideoId);
      setCurrentTime(0);
    }
  }, [currentVideoId, player]);

  const playerControls = {
    play: (videoId) => {
      if (videoId) setCurrentVideoId(videoId);
      if (player) {
        player.playVideo();
        setIsPlaying(true);
      }
    },
    pause: () => {
      if (player) {
        player.pauseVideo();
        setIsPlaying(false);
      }
    },
    setVideo: (videoId) => setCurrentVideoId(videoId),
    isPlaying,
    currentTime,
    duration,
  };

  return (
    <PlayerContext.Provider value={playerControls}>
      {children}
      <div id="youtube-player" style={{ display: 'none' }}></div>
    </PlayerContext.Provider>
  );
}

export default PlayerContext;
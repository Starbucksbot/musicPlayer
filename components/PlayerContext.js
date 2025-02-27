import { createContext, useContext } from 'react';

// Create the PlayerContext
const PlayerContext = createContext();

// Custom hook to use the PlayerContext
export function usePlayer() {
  return useContext(PlayerContext);
}

// Provider component to wrap the app or relevant components
export function PlayerProvider({ children, value }) {
  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export default PlayerContext;
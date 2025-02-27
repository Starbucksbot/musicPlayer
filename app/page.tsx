'use client';

import { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react';
import axios from 'axios';

export default function Home() {
  const [history, setHistory] = useState<any[]>([]);
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [nextTrack, setNextTrack] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio] = useState(new Audio());
  const [sleepTimer, setSleepTimer] = useState(12);

  useEffect(() => {
    axios.get('/api/history').then((res) => setHistory(res.data));
  }, []);

  const playTrack = async (videoId: string, title: string, artist: string) => {
    audio.src = `/api/stream/${videoId}`;
    audio.play();
    setIsPlaying(true);
    setCurrentTrack({ videoId, title, artist });

    await axios.post('/api/history', { videoId, title, artist });
    const updatedHistory = await axios.get('/api/history');
    setHistory(updatedHistory.data);

    const next = await axios.get(`/api/recommend/${videoId}`);
    setNextTrack(next.data);
  };

  const handleSearch = async () => {
    const res = await axios.get(`/api/search?q=${searchQuery}`);
    setSearchResults(res.data);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const skipNext = () => {
    if (nextTrack) {
      playTrack(nextTrack.id.videoId, nextTrack.snippet.title, nextTrack.snippet.channelTitle);
    }
  };

  const skipPrevious = () => {
    if (history.length > 1) {
      const prev = history[1];
      playTrack(prev.videoId, prev.title, prev.artist);
    }
  };

  const setTimer = (hours: number) => {
    setSleepTimer(hours);
    setTimeout(() => {
      audio.pause();
      setIsPlaying(false);
    }, hours * 60 * 60 * 1000);
  };

  return (
    <div className="grid grid-cols-3 h-screen bg-gray-900 text-white">
      {/* Left Panel: History */}
      <div className="p-4 border-r border-gray-700 overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Recently Played</h2>
        {history.map((track: any, idx: number) => (
          <div
            key={idx}
            className="p-2 hover:bg-gray-800 cursor-pointer"
            onClick={() => playTrack(track.videoId, track.title, track.artist)}
          >
            {track.title} - {track.artist}
          </div>
        ))}
      </div>

      {/* Middle Panel: Current Track */}
      <div className="p-4 flex flex-col items-center justify-center">
        <input
          type="text"
          placeholder="Search YouTube..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          className="mb-4 w-full max-w-md bg-gray-800 text-white border border-gray-700 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {currentTrack && (
          <>
            <img
              src={`https://img.youtube.com/vi/${currentTrack.videoId}/0.jpg`}
              alt="thumbnail"
              className="w-64 h-64 mb-4 rounded-lg"
            />
            <h3 className="text-xl font-semibold">{currentTrack.title}</h3>
            <p className="text-gray-400">{currentTrack.artist}</p>
            <div className="flex gap-4 mt-4">
              <button
                onClick={skipPrevious}
                className="p-2 text-gray-400 hover:text-white"
              >
                <SkipBack />
              </button>
              <button
                onClick={togglePlayPause}
                className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white hover:bg-blue-600"
              >
                {isPlaying ? <Pause /> : <Play />}
              </button>
              <button
                onClick={skipNext}
                className="p-2 text-gray-400 hover:text-white"
              >
                <SkipForward />
              </button>
            </div>
            <button
              onClick={() => setTimer(sleepTimer)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-md hover:bg-gray-700"
            >
              <Clock /> Sleep {sleepTimer}h
            </button>
            <select
              value={sleepTimer}
              onChange={(e) => setSleepTimer(Number(e.target.value))}
              className="mt-2 bg-gray-800 border border-gray-700 rounded-md p-2 text-white focus:outline-none"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
              ))}
            </select>
          </>
        )}
        {searchResults.map((result: any) => (
          <div
            key={result.id.videoId}
            className="p-2 hover:bg-gray-800 cursor-pointer"
            onClick={() => playTrack(result.id.videoId, result.snippet.title, result.snippet.channelTitle)}
          >
            {result.snippet.title}
          </div>
        ))}
      </div>

      {/* Right Panel: Next Track */}
      <div className="p-4 border-l border-gray-700">
        <h2 className="text-lg font-bold mb-4">Up Next</h2>
        {nextTrack && (
          <div
            className="p-2 hover:bg-gray-800 cursor-pointer"
            onClick={() => playTrack(nextTrack.id.videoId, nextTrack.snippet.title, nextTrack.snippet.channelTitle)}
          >
            <img src={nextTrack.snippet.thumbnails.default.url} alt="next thumbnail" className="w-16 h-16 mb-2 rounded" />
            {nextTrack.snippet.title} - {nextTrack.snippet.channelTitle}
          </div>
        )}
      </div>
    </div>
  );
}
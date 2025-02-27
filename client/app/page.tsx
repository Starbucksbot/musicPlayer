'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react';
import axios from 'axios';

export default function Home() {
  const [history, setHistory] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [nextTrack, setNextTrack] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio] = useState(new Audio());
  const [sleepTimer, setSleepTimer] = useState(12); // Default 12 hours

  // Fetch history on load
  useEffect(() => {
    axios.get('http://localhost:5000/history').then((res) => setHistory(res.data));
  }, []);

  // Play a track
  const playTrack = async (videoId, title, artist) => {
    audio.src = `http://localhost:5000/stream/${videoId}`;
    audio.play();
    setIsPlaying(true);
    setCurrentTrack({ videoId, title, artist });

    // Save to history
    await axios.post('http://localhost:5000/history', { videoId, title, artist });
    const updatedHistory = await axios.get('http://localhost:5000/history');
    setHistory(updatedHistory.data);

    // Fetch next recommendation
    const next = await axios.get(`http://localhost:5000/recommend/${videoId}`);
    setNextTrack(next.data);
  };

  // Search YouTube
  const handleSearch = async () => {
    const res = await axios.get(`http://localhost:5000/search?q=${searchQuery}`);
    setSearchResults(res.data);
  };

  // Playback controls
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

  // Sleep timer
  const setTimer = (hours) => {
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
        {history.map((track, idx) => (
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
        <Input
          placeholder="Search YouTube..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          className="mb-4 w-full max-w-md bg-gray-800 text-white border-gray-700"
        />
        {currentTrack && (
          <>
            <img
              src={`https://img.youtube.com/vi/${currentTrack.videoId}/0.jpg`}
              alt="thumbnail"
              className="w-64 h-64 mb-4"
            />
            <h3 className="text-xl font-semibold">{currentTrack.title}</h3>
            <p className="text-gray-400">{currentTrack.artist}</p>
            <div className="flex gap-4 mt-4">
              <Button variant="ghost" onClick={skipPrevious}>
                <SkipBack />
              </Button>
              <Button className="rounded-full w-12 h-12" onClick={togglePlayPause}>
                {isPlaying ? <Pause /> : <Play />}
              </Button>
              <Button variant="ghost" onClick={skipNext}>
                <SkipForward />
              </Button>
            </div>
            <Button variant="outline" className="mt-4" onClick={() => setTimer(sleepTimer)}>
              <Clock /> Sleep {sleepTimer}h
            </Button>
            <select
              value={sleepTimer}
              onChange={(e) => setSleepTimer(Number(e.target.value))}
              className="mt-2 bg-gray-800 border-gray-700"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
              ))}
            </select>
          </>
        )}
        {searchResults.map((result) => (
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
            <img
              src={nextTrack.snippet.thumbnails.default.url}
              alt="next thumbnail"
              className="w-16 h-16 mb-2"
            />
            {nextTrack.snippet.title} - {nextTrack.snippet.channelTitle}
          </div>
        )}
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import SetupScreen from './components/SetupScreen';
import Whiteboard from './components/Whiteboard';

export default function App() {
  const [joined, setJoined] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [roomId, setRoomId] = useState('default');

  // Load Room Code from browser URL query param (e.g. ?room=1234) on startup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setRoomId(roomParam);
    }
  }, []);

  const handleJoin = (userName: string, userColor: string, roomCode: string) => {
    setName(userName);
    setColor(userColor);
    setRoomId(roomCode);
    
    // Update URL query parameter seamlessly without triggering a reload
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set('room', roomCode);
    const newPath = `${window.location.pathname}?${searchParams.toString()}`;
    window.history.pushState({}, '', newPath);
    
    setJoined(true);
  };

  const handleLeave = () => {
    setJoined(false);
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 font-sans antialiased text-slate-100 select-none">
      {joined ? (
        <Whiteboard
          name={name}
          color={color}
          roomId={roomId}
          onLeave={handleLeave}
        />
      ) : (
        <SetupScreen
          initialRoomId={roomId}
          onJoin={handleJoin}
        />
      )}
    </div>
  );
}

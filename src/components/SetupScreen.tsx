import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface SetupScreenProps {
  initialRoomId: string;
  onJoin: (name: string, color: string, roomId: string) => void;
}

const PRESET_COLORS = [
  '#4f46e5', // Indigo (Default)
  '#10b981', // Emerald
  '#f43f5e', // Rose
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#f97316', // Orange
  '#06b6d4', // Cyan
];

export default function SetupScreen({ initialRoomId, onJoin }: SetupScreenProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [roomId, setRoomId] = useState(initialRoomId || 'default');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    onJoin(name.trim(), color, roomId.trim() || 'default');
  };

  return (
    <div 
      className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 relative overflow-hidden select-none"
      style={{ backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)', backgroundSize: '30px 30px' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-8 relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/20 mb-4">
            <div className="w-5 h-5 border-2 border-white rotate-45"></div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">SyncBoard</h1>
          <p className="text-xs text-slate-500 mt-1">Real-time collaborative workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. Sarah"
              className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800 placeholder-slate-400 rounded-xl px-4 py-3 text-sm transition-all outline-none font-sans font-medium"
              maxLength={20}
              autoFocus
            />
            {error && <p className="text-xs text-rose-500 mt-1.5 font-medium">{error}</p>}
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Cursor Color
            </label>
            <div className="grid grid-cols-8 gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(preset)}
                  className={`h-8 rounded-lg transition-all relative ${
                    color === preset
                      ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-sm'
                      : 'hover:scale-105 active:scale-95'
                  }`}
                  style={{ backgroundColor: preset }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Room Code
            </label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              placeholder="e.g. default"
              className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-800 placeholder-slate-400 rounded-xl px-4 py-3 text-sm transition-all outline-none font-mono font-medium"
              maxLength={15}
            />
            <p className="text-[11px] text-slate-400 mt-1.5 leading-normal">
              Join the same room code to instantly draw on the exact same whiteboard together.
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 active:translate-y-[1px] cursor-pointer"
          >
            <span className="font-semibold">Enter Workspace</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </motion.div>
    </div>
  );
}

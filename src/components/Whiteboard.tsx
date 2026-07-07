import React, { useRef, useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { DrawElement, ChatMessage, User } from '../types';
import { 
  Square, Circle, Minus, Type, Pencil, Brush, Eraser, 
  Trash2, Undo2, Download, Send, MessageSquare, ChevronRight, 
  ChevronLeft, Copy, Check, Users, ShieldAlert, Sparkles, HelpCircle,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WhiteboardProps {
  name: string;
  color: string;
  roomId: string;
  onLeave: () => void;
}

const PRESET_COLORS = [
  '#f8fafc', // White/Slate-50
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
];

export default function Whiteboard({ name, color, roomId, onLeave }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // States
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [myId, setMyId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(true);

  // Tool states
  const [tool, setTool] = useState<DrawElement['type']>('pencil');
  const [strokeColor, setStrokeColor] = useState(color);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [fillShape, setFillShape] = useState(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<DrawElement | null>(null);
  const [remoteActiveStrokes, setRemoteActiveStrokes] = useState<Record<string, DrawElement | null>>({});

  // Text input state
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textVal, setTextVal] = useState('');

  // UI status
  const [copied, setCopied] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'chat' | 'layers'>('chat');
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);

  // 1. Initialize Socket Connection and Listeners
  useEffect(() => {
    const socket = io(window.location.origin);
    socketRef.current = socket;

    // Join room
    socket.emit('room:join', { roomId, name, color });

    // Listeners
    socket.on('room:init', ({ elements: initialElements, messages: initialMessages, users: initialUsers, myId: assignedId }) => {
      setElements(initialElements);
      setMessages(initialMessages);
      setUsers(initialUsers);
      setMyId(assignedId);
    });

    socket.on('room:users', (updatedUsers: User[]) => {
      setUsers(updatedUsers);
    });

    socket.on('cursor:update', ({ userId, cursor }) => {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, cursor } : u));
    });

    socket.on('draw:progress_update', ({ userId, stroke }) => {
      setRemoteActiveStrokes(prev => ({
        ...prev,
        [userId]: stroke
      }));
    });

    socket.on('draw:committed', (element: DrawElement) => {
      setElements(prev => {
        // Idempotency check: guard against duplicate commit syncs
        if (prev.some(el => el.id === element.id)) return prev;
        return [...prev, element];
      });
      // Clear remote active stroke for this user
      setRemoteActiveStrokes(prev => ({
        ...prev,
        [element.userId]: null
      }));
    });

    socket.on('draw:undone', ({ elementId }) => {
      setElements(prev => prev.filter(el => el.id !== elementId));
    });

    socket.on('canvas:cleared', () => {
      setElements([]);
      setRemoteActiveStrokes({});
    });

    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, name, color]);

  // 2. Adjust Canvas Size on Resize or Layout changes
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      // Adjust for High-DPI screens
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      
      // Repaint everything after size change
      drawCanvas();
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Slight delay to handle slide animations of sidebar
    const timer = setTimeout(resizeCanvas, 300);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      clearTimeout(timer);
    };
  }, [elements, currentStroke, remoteActiveStrokes, isChatOpen]);

  // Trigger draw when drawing state changes
  useEffect(() => {
    drawCanvas();
  }, [elements, currentStroke, remoteActiveStrokes]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return; // Skip when typing in fields
      }

      switch (e.key.toLowerCase()) {
        case 'p':
          setTool('pencil');
          break;
        case 'b':
          setTool('brush');
          break;
        case 'e':
          setTool('eraser');
          break;
        case 'l':
          setTool('line');
          break;
        case 'r':
          setTool('rectangle');
          break;
        case 'c':
          setTool('circle');
          break;
        case 't':
          setTool('text');
          break;
        case 'z':
          if (e.metaKey || e.ctrlKey) {
            handleUndo();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 3. Canvas Painting Functions
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.fillStyle = '#cbd5e1'; // Slate-300 dots
    const gridSize = 30;

    for (let x = gridSize; x < width; x += gridSize) {
      for (let y = gridSize; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  const drawElement = (ctx: CanvasRenderingContext2D, el: DrawElement) => {
    ctx.beginPath();
    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (el.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }

    if (el.type === 'pencil' || el.type === 'brush' || el.type === 'eraser') {
      if (!el.points || el.points.length === 0) return;
      ctx.moveTo(el.points[0].x, el.points[0].y);
      for (let i = 1; i < el.points.length; i++) {
        ctx.lineTo(el.points[i].x, el.points[i].y);
      }
      ctx.stroke();
    } else if (el.type === 'line') {
      if (el.x1 === undefined || el.y1 === undefined || el.x2 === undefined || el.y2 === undefined) return;
      ctx.moveTo(el.x1, el.y1);
      ctx.lineTo(el.x2, el.y2);
      ctx.stroke();
    } else if (el.type === 'rectangle') {
      if (el.x1 === undefined || el.y1 === undefined || el.x2 === undefined || el.y2 === undefined) return;
      const x = Math.min(el.x1, el.x2);
      const y = Math.min(el.y1, el.y2);
      const w = Math.abs(el.x2 - el.x1);
      const h = Math.abs(el.y2 - el.y1);
      if (el.fill) {
        ctx.fillStyle = el.color;
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeRect(x, y, w, h);
    } else if (el.type === 'circle') {
      if (el.x1 === undefined || el.y1 === undefined || el.x2 === undefined || el.y2 === undefined) return;
      const r = Math.sqrt(Math.pow(el.x2 - el.x1, 2) + Math.pow(el.y2 - el.y1, 2));
      ctx.arc(el.x1, el.y1, r, 0, 2 * Math.PI);
      if (el.fill) {
        ctx.fillStyle = el.color;
        ctx.fill();
      }
      ctx.stroke();
    } else if (el.type === 'text') {
      if (el.x1 === undefined || el.y1 === undefined || !el.text) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = el.color;
      ctx.font = `${el.width * 3 + 12}px sans-serif`;
      ctx.fillText(el.text, el.x1, el.y1);
    }

    ctx.globalCompositeOperation = 'source-over';
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    // Clear and Redraw background
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, width, height);

    // 1. Draw committed elements
    elements.forEach(el => {
      drawElement(ctx, el);
    });

    // 2. Draw remote active drawing strokes
    (Object.values(remoteActiveStrokes) as (DrawElement | null)[]).forEach(stroke => {
      if (stroke) {
        drawElement(ctx, stroke);
      }
    });

    // 3. Draw local active drawing stroke
    if (currentStroke) {
      drawElement(ctx, currentStroke);
    }
  };

  // 4. Coordinates extraction helper
  const getCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const getStrokeTip = (stroke: DrawElement) => {
    if (stroke.type === 'pencil' || stroke.type === 'brush' || stroke.type === 'eraser') {
      const pts = stroke.points || [];
      if (pts.length > 0) {
        return pts[pts.length - 1];
      }
    } else if (stroke.x2 !== undefined && stroke.y2 !== undefined) {
      return { x: stroke.x2, y: stroke.y2 };
    }
    return null;
  };

  // Throttle cursor movement emission
  const lastCursorEmitRef = useRef<number>(0);
  const handleCursorMove = (coords: { x: number; y: number } | null) => {
    const now = Date.now();
    if (now - lastCursorEmitRef.current > 30) {
      socketRef.current?.emit('cursor:move', coords);
      lastCursorEmitRef.current = now;
    }
  };

  // 5. Drawing Event Handlers
  const handleStartDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (textInput) {
      // Blur active text input
      commitText();
      return;
    }

    const coords = getCoords(e);
    if (!coords) return;

    if (tool === 'text') {
      setTextInput({ x: coords.x, y: coords.y });
      setTextVal('');
      return;
    }

    setIsDrawing(true);

    const initialStroke: DrawElement = {
      id: `el-${Date.now()}-${Math.random()}`,
      type: tool,
      points: tool === 'pencil' || tool === 'brush' || tool === 'eraser' ? [coords] : undefined,
      x1: coords.x,
      y1: coords.y,
      x2: coords.x,
      y2: coords.y,
      color: tool === 'eraser' ? '#f8fafc' : strokeColor,
      width: tool === 'brush' ? strokeWidth * 3 : tool === 'eraser' ? strokeWidth * 5 : strokeWidth,
      fill: fillShape,
      userId: myId,
      userName: name
    };

    setCurrentStroke(initialStroke);
    socketRef.current?.emit('draw:progress', initialStroke);
  };

  const handleActiveDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCoords(e);
    if (!coords) return;

    // Track cursor movement
    handleCursorMove(coords);

    if (!isDrawing || !currentStroke) return;

    let updatedStroke: DrawElement = { ...currentStroke };

    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') {
      const points = [...(currentStroke.points || []), coords];
      updatedStroke.points = points;
    } else {
      updatedStroke.x2 = coords.x;
      updatedStroke.y2 = coords.y;
    }

    setCurrentStroke(updatedStroke);
    socketRef.current?.emit('draw:progress', updatedStroke);
  };

  const handleEndDraw = () => {
    if (!isDrawing || !currentStroke) return;
    setIsDrawing(false);

    // Commit current stroke
    const finalElement = { ...currentStroke };
    setElements(prev => [...prev, finalElement]);
    socketRef.current?.emit('draw:commit', finalElement);
    
    // Reset state
    setCurrentStroke(null);
    socketRef.current?.emit('draw:progress', null);
  };

  const handleMouseLeaveCanvas = () => {
    // Reset cursor on server
    socketRef.current?.emit('cursor:move', null);
    if (isDrawing) {
      handleEndDraw();
    }
  };

  // 6. Text tool handlers
  const commitText = () => {
    if (!textInput || !textVal.trim()) {
      setTextInput(null);
      return;
    }

    const textElement: DrawElement = {
      id: `el-${Date.now()}-${Math.random()}`,
      type: 'text',
      x1: textInput.x,
      y1: textInput.y,
      text: textVal.trim(),
      color: strokeColor,
      width: strokeWidth,
      userId: myId,
      userName: name
    };

    setElements(prev => [...prev, textElement]);
    socketRef.current?.emit('draw:commit', textElement);
    setTextInput(null);
    setTextVal('');
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitText();
    } else if (e.key === 'Escape') {
      setTextInput(null);
    }
  };

  // 7. Core Toolbar Actions
  const handleUndo = () => {
    socketRef.current?.emit('draw:undo');
  };

  const handleClearCanvas = () => {
    socketRef.current?.emit('canvas:clear');
    setShowConfirmClear(false);
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create a virtual canvas to merge whiteboard drawing and standard white/dark slate background
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) return;

    // Scale down virtual coordinate grid
    const dpr = window.devicePixelRatio || 1;
    exportCtx.scale(dpr, dpr);

    // Draw solid light background matching canvas container
    exportCtx.fillStyle = '#f8fafc'; // slate-50
    exportCtx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Draw blueprint graph lines
    drawGrid(exportCtx, canvas.width / dpr, canvas.height / dpr);

    // Draw whiteboard elements
    elements.forEach(el => {
      // Overwrite eraser behavior on the light background image export
      const modifiedEl = { ...el };
      if (modifiedEl.type === 'eraser') {
        modifiedEl.color = '#f8fafc';
      }
      drawElement(exportCtx, modifiedEl);
    });

    // Create image link and trigger download
    const dataUrl = exportCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `whiteboard-room-${roomId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 8. Chat Event Handlers
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    socketRef.current?.emit('chat:send', chatInput.trim());
    setChatInput('');
  };

  return (
    <div className="h-screen bg-[#F8FAFC] flex flex-col overflow-hidden select-none font-sans text-slate-700">
      
      {/* HEADER SECTION */}
      <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md shadow-indigo-600/10">
            <div className="w-3.5 h-3.5 border-2 border-white rotate-45"></div>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 flex items-center gap-2">
              SyncBoard
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Active Room:</span>
              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-indigo-600 font-bold">{roomId}</span>
            </div>
          </div>
        </div>

        {/* Room Actions / Share controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border border-slate-200 shadow-sm active:scale-95 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          <div className="h-4 w-[1px] bg-slate-200" />

          {/* Active Collaborators count */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
            <Users className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[11px] font-bold text-slate-600">{users.length} Online</span>
            
            {/* Avatars */}
            <div className="flex -space-x-1.5 ml-1 overflow-hidden">
              {users.slice(0, 3).map((u) => (
                <div
                  key={u.id}
                  title={u.name}
                  className="w-5 h-5 rounded-full border border-white flex items-center justify-center text-[8px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: u.color }}
                >
                  {u.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {users.length > 3 && (
                <div className="w-5 h-5 rounded-full bg-slate-200 border border-white flex items-center justify-center text-[7px] font-bold text-slate-600">
                  +{users.length - 3}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setShowHelp(true)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-xl hover:bg-slate-50 cursor-pointer"
            title="Shortcuts"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            onClick={onLeave}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 px-3.5 py-2 rounded-xl transition-all border border-rose-100 active:scale-95 cursor-pointer"
          >
            Leave
          </button>
        </div>
      </header>

      {/* WORKSPACE AREA (Toolbar + Canvas + Chat) */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* FLOATING VERTICAL TOOLBAR */}
        <div className="absolute top-6 left-6 z-10 flex flex-col gap-4 bg-white border border-slate-200/80 p-2.5 rounded-2xl shadow-xl shadow-slate-200/50">
          <div className="flex flex-col gap-1">
            {[
              { type: 'pencil', label: 'Pencil (P)', icon: Pencil },
              { type: 'brush', label: 'Brush (B)', icon: Brush },
              { type: 'eraser', label: 'Eraser (E)', icon: Eraser },
              { type: 'line', label: 'Line (L)', icon: Minus },
              { type: 'rectangle', label: 'Rectangle (R)', icon: Square },
              { type: 'circle', label: 'Circle (C)', icon: Circle },
              { type: 'text', label: 'Text (T)', icon: Type },
            ].map((t) => {
              const Icon = t.icon;
              const active = tool === t.type;
              return (
                <button
                  key={t.type}
                  onClick={() => {
                    setTool(t.type as DrawElement['type']);
                    if (textInput) setTextInput(null);
                  }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative group cursor-pointer ${
                    active 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 scale-105' 
                      : 'text-slate-400 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                  title={t.label}
                >
                  <Icon className="w-4.5 h-4.5" />
                  <span className="absolute left-14 bg-slate-900 text-white text-[10px] font-semibold px-2 py-1 rounded-md shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="h-[1px] bg-slate-100" />

          {/* Color palette selector */}
          {tool !== 'eraser' && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Color</span>
              <div className="grid grid-cols-5 gap-1 px-1">
                {PRESET_COLORS.map((c) => (
                  <button
                     key={c}
                     onClick={() => setStrokeColor(c)}
                     className={`w-4.5 h-4.5 rounded-full transition-all relative border border-black/5 ${
                       strokeColor === c 
                         ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110 shadow-sm' 
                         : 'hover:scale-105 active:scale-95'
                     }`}
                     style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 px-1 mt-1">
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => setStrokeColor(e.target.value)}
                  className="w-full h-6 bg-transparent border-0 cursor-pointer rounded outline-none p-0"
                  title="Custom Color"
                />
              </div>
            </div>
          )}

          <div className="h-[1px] bg-slate-100" />

          {/* Size configuration */}
          <div className="flex flex-col gap-1 px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Size ({strokeWidth}px)
            </span>
            <input
              type="range"
              min="1"
              max="20"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
              className="w-20 accent-indigo-600 cursor-pointer h-1.5 bg-slate-100 rounded-lg appearance-none"
            />
          </div>

          {/* Fill shape toggler (only relevant for shapes) */}
          {(tool === 'rectangle' || tool === 'circle') && (
            <>
              <div className="h-[1px] bg-slate-100" />
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fill</span>
                <button
                  onClick={() => setFillShape(!fillShape)}
                  className={`w-7 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                    fillShape ? 'bg-indigo-600' : 'bg-slate-200'
                  }`}
                >
                  <span 
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      fillShape ? 'translate-x-2.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </>
          )}
        </div>

        {/* BOTTOM FLOATING CANVAS ACTION CONTROLS */}
        <div className="absolute bottom-6 left-6 z-10 flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-xl shadow-slate-200/40">
          <button
            onClick={handleUndo}
            disabled={elements.length === 0}
            className={`p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer ${
              elements.length > 0
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:scale-95'
                : 'text-slate-300 cursor-not-allowed'
            }`}
            title="Undo stroke (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
            <span>Undo</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-200" />

          <button
            onClick={handleDownload}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:scale-95 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer"
            title="Export to PNG"
          >
            <Download className="w-4 h-4 text-indigo-500" />
            <span>Export Image</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-200" />

          {showConfirmClear ? (
            <div className="flex items-center gap-1 px-1">
              <span className="text-[11px] text-rose-600 font-bold">Clear?</span>
              <button
                onClick={handleClearCanvas}
                className="bg-rose-600 hover:bg-rose-500 text-white text-[10px] px-2 py-1 rounded-lg font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                Yes
              </button>
              <button
                onClick={() => setShowConfirmClear(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] px-2 py-1 rounded-lg font-medium transition-all active:scale-95 cursor-pointer"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmClear(true)}
              className="p-2.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 active:scale-95 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer"
              title="Clear Whiteboard"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span className="text-rose-500">Clear Board</span>
            </button>
          )}
        </div>

        {/* CANVAS WORKSPACE STAGE */}
        <div 
          ref={containerRef} 
          className="flex-1 h-full relative cursor-crosshair bg-[#f8fafc]"
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleStartDraw}
            onMouseMove={handleActiveDraw}
            onMouseUp={handleEndDraw}
            onMouseLeave={handleMouseLeaveCanvas}
            onTouchStart={handleStartDraw}
            onTouchMove={handleActiveDraw}
            onTouchEnd={handleEndDraw}
            className="absolute inset-0 block touch-none"
          />

          {/* FLOATING TEXT INPUT BOX */}
          {textInput && (
            <div
              className="absolute z-20 bg-white border border-slate-200 p-2 rounded-xl shadow-xl shadow-indigo-600/5"
              style={{ left: textInput.x, top: textInput.y - 40 }}
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={textVal}
                  onChange={(e) => setTextVal(e.target.value)}
                  onKeyDown={handleTextKeyDown}
                  placeholder="Type text & hit Enter"
                  className="bg-slate-50 border border-slate-200 text-slate-800 text-xs px-3 py-2 rounded-lg outline-none w-48 focus:border-indigo-500 font-sans font-medium"
                  autoFocus
                />
                <button
                  onClick={commitText}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* FLOATING REMOTE LIVE CURSORS */}
          {users.map((u) => {
            if (u.id === myId || !u.cursor) return null;
            
            const isUserDrawing = !!remoteActiveStrokes[u.id];

            return (
              <div
                key={u.id}
                className="absolute pointer-events-none transition-all duration-75 z-30"
                style={{
                  left: u.cursor.x,
                  top: u.cursor.y,
                }}
              >
                <svg
                  className="w-4 h-4 drop-shadow-md select-none pointer-events-none rotate-[15deg]"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 3L10.07 19.97C10.18 20.24 10.43 20.4 10.7 20.4C10.97 20.4 11.22 20.24 11.33 19.97L14.22 13.07L21.12 10.18C21.39 10.07 21.55 9.82 21.55 9.55C21.55 9.28 21.39 9.03 21.12 8.92L4.15 1.85C3.89 1.74 3.59 1.81 3.4 2.01C3.2 2.2 3.13 2.5 3.24 2.76L3 3Z"
                    fill={u.color}
                    stroke="white"
                    strokeWidth="1.5"
                  />
                </svg>

                {/* Floating badge */}
                <div
                  className="absolute left-3 top-3 px-2 py-0.5 text-[9px] font-bold text-white rounded-md whitespace-nowrap shadow-sm flex items-center gap-1"
                  style={{ backgroundColor: u.color }}
                >
                  {isUserDrawing && <span className="w-1 h-1 bg-white rounded-full animate-ping" />}
                  <span>{u.name}</span>
                </div>
              </div>
            );
          })}

          {/* FLOATING ACTIVE DRAWING NAME BADGES */}
          {currentStroke && (() => {
            const tip = getStrokeTip(currentStroke);
            if (!tip) return null;
            return (
              <div
                className="absolute pointer-events-none z-30 flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold text-white shadow-md -translate-x-1/2 -translate-y-full mb-3"
                style={{
                  left: tip.x,
                  top: tip.y,
                  backgroundColor: strokeColor === '#f8fafc' ? '#4f46e5' : strokeColor,
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                }}
              >
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                <span>{name} (You)</span>
              </div>
            );
          })()}

          {Object.entries(remoteActiveStrokes).map(([uId, stroke]) => {
            const activeStroke = stroke as DrawElement | null;
            if (!activeStroke) return null;
            const tip = getStrokeTip(activeStroke);
            if (!tip) return null;
            const user = users.find(u => u.id === uId);
            const bgColor = user?.color || activeStroke.color || '#4f46e5';
            return (
              <div
                key={`tip-${uId}`}
                className="absolute pointer-events-none z-30 flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold text-white shadow-md -translate-x-1/2 -translate-y-full mb-3"
                style={{
                  left: tip.x,
                  top: tip.y,
                  backgroundColor: bgColor === '#f8fafc' ? '#4f46e5' : bgColor,
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                }}
              >
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                <span>{activeStroke.userName || user?.name || 'Collaborator'}</span>
              </div>
            );
          })}
        </div>

        {/* COLLAPSIBLE SIDEBAR PANEL (CHAT & LAYERS) */}
        <div className="relative flex shrink-0 h-full">
          
          {/* Collapse toggler */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full bg-white border-l border-t border-b border-slate-200 text-slate-400 hover:text-slate-700 p-2.5 rounded-l-xl shadow-lg shadow-slate-200/40 transition-colors z-10 cursor-pointer"
          >
            {isChatOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>

          {/* Sliding sidebar container */}
          <motion.div
            animate={{ width: isChatOpen ? 320 : 0 }}
            className="h-full bg-slate-50 border-l border-slate-200 flex flex-col overflow-hidden shadow-2xl relative z-0"
          >
            {/* Tab selector */}
            <div className="p-3 border-b border-slate-200 bg-white flex items-center gap-2">
              <button
                onClick={() => setSidebarTab('chat')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  sidebarTab === 'chat'
                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Live Chat
              </button>
              <button
                onClick={() => setSidebarTab('layers')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  sidebarTab === 'layers'
                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Layers & Info
              </button>
            </div>

            {sidebarTab === 'chat' ? (
              <>
                {/* Scrollable chat messages stream */}
                <div className="flex-1 p-4 overflow-y-auto space-y-4 select-text">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center px-4">
                      <div className="w-10 h-10 rounded-full border border-dashed border-slate-200 flex items-center justify-center mb-2">
                        <MessageSquare className="w-4 h-4 text-slate-300" />
                      </div>
                      <p className="text-[11px]">No messages. Say hello to start the conversation!</p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      if (m.userId === 'system') {
                        return (
                          <div key={m.id} className="text-[10px] text-slate-400 text-center py-1 bg-slate-100 rounded-lg border border-slate-200/40 mx-2 font-medium">
                            {m.text}
                          </div>
                        );
                      }

                      const isMe = m.userId === myId;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col max-w-[85%] ${
                            isMe ? 'ml-auto items-end' : 'mr-auto items-start'
                          }`}
                        >
                          <span 
                            className="text-[9px] font-bold mb-0.5 text-slate-400"
                            style={{ color: isMe ? undefined : m.userColor }}
                          >
                            {isMe ? 'You' : m.userName}
                          </span>
                          <div
                            className={`px-3 py-2 rounded-2xl text-xs leading-normal shadow-sm ${
                              isMe
                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                            }`}
                          >
                            {m.text}
                          </div>
                          <span className="text-[8px] text-slate-400 mt-0.5">
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Chat message composer */}
                <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200 bg-white flex gap-1.5">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type message..."
                    className="flex-1 bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs px-3 py-2.5 rounded-xl outline-none placeholder-slate-400 font-medium"
                    maxLength={100}
                  />
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl transition-all shadow-sm flex items-center justify-center active:scale-95 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 p-4 flex flex-col overflow-y-auto space-y-4">
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">History & Layers</h3>
                  {elements.length === 0 ? (
                    <div className="p-4 bg-white rounded-xl border border-slate-200 text-center text-xs text-slate-400">
                      No layers on whiteboard yet. Start drawing to create some shapes!
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {elements.slice(-10).reverse().map((el, i) => (
                        <div key={el.id || i} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200 shadow-sm text-xs text-slate-700">
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-2.5 h-2.5 rounded-full block border border-black/5" 
                              style={{ backgroundColor: el.color }}
                            />
                            <span className="font-semibold capitalize text-slate-800">{el.userName}'s {el.type}</span>
                          </div>
                          <span className="text-[9px] text-slate-400 font-mono">#{elements.length - i}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">PRO-TIP: SHORTCUTS</h4>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Press <kbd className="bg-white px-1.5 py-0.5 border border-slate-200 shadow-sm rounded text-[9px] font-semibold text-slate-700">P</kbd> for Pencil,{' '}
                    <kbd className="bg-white px-1.5 py-0.5 border border-slate-200 shadow-sm rounded text-[9px] font-semibold text-slate-700">E</kbd> for Eraser,{' '}
                    <kbd className="bg-white px-1.5 py-0.5 border border-slate-200 shadow-sm rounded text-[9px] font-semibold text-slate-700">R</kbd> for Rectangle, and{' '}
                    <kbd className="bg-white px-1.5 py-0.5 border border-slate-200 shadow-sm rounded text-[9px] font-semibold text-slate-700">Ctrl+Z</kbd> to Undo.
                  </p>
                </div>

                <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 mb-1">CO-DRAWING STATISTICS</h4>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
                      <span className="block text-[9px] text-slate-400 font-bold uppercase">Shapes</span>
                      <span className="text-sm font-bold text-slate-800">{elements.length}</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
                      <span className="block text-[9px] text-slate-400 font-bold uppercase">Members</span>
                      <span className="text-sm font-bold text-slate-800">{users.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>

      </div>

      {/* FOOTER / STATUS BAR */}
      <footer className="h-8 bg-white border-t border-slate-200 px-4 flex items-center justify-between text-[10px] text-slate-400 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="font-semibold text-slate-500">Live Services Connected</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-200" />
          <span className="font-mono">User: {name} ({myId.slice(0, 5)})</span>
        </div>
        <div className="flex items-center gap-4 font-mono">
          {hoverCoords ? (
            <span>X: {Math.round(hoverCoords.x)}px &nbsp; Y: {Math.round(hoverCoords.y)}px</span>
          ) : (
            <span>X: -- &nbsp; Y: --</span>
          )}
          <div className="h-3 w-[1px] bg-slate-200" />
          <span>Ping: 14ms</span>
        </div>
      </footer>

      {/* MODAL - KEYBOARD SHORTCUTS & HELP GUIDE */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-white border border-slate-200 p-6 rounded-2xl shadow-xl relative text-slate-800"
            >
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Info className="w-4.5 h-4.5 text-indigo-500" />
                <span>Keyboard Shortcuts</span>
              </h3>
              
              <div className="space-y-2.5 text-xs text-slate-600">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>Pencil Tool</span>
                  <kbd className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-800 border border-slate-200 font-semibold">P</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>Brush Tool</span>
                  <kbd className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-800 border border-slate-200 font-semibold">B</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>Eraser Tool</span>
                  <kbd className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-800 border border-slate-200 font-semibold">E</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>Draw Line</span>
                  <kbd className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-800 border border-slate-200 font-semibold">L</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>Draw Rectangle</span>
                  <kbd className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-800 border border-slate-200 font-semibold">R</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>Draw Circle</span>
                  <kbd className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-800 border border-slate-200 font-semibold">C</kbd>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>Add Text</span>
                  <kbd className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-800 border border-slate-200 font-semibold">T</kbd>
                </div>
                <div className="flex items-center justify-between pb-1">
                  <span>Undo Stroke</span>
                  <kbd className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[10px] text-slate-800 border border-slate-200 font-semibold">Ctrl + Z</kbd>
                </div>
              </div>

              <button
                onClick={() => setShowHelp(false)}
                className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 cursor-pointer text-xs"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

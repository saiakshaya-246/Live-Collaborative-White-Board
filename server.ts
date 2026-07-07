import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

// Derive __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DrawElement {
  id: string;
  type: 'pencil' | 'brush' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text';
  points?: { x: number; y: number }[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  text?: string;
  color: string;
  width: number;
  fill?: boolean;
  userId: string;
  userName: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  timestamp: number;
}

interface User {
  id: string; // Socket ID
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
}

interface RoomData {
  elements: DrawElement[];
  users: Map<string, User>;
  messages: ChatMessage[];
}

// In-memory store for rooms
const rooms = new Map<string, RoomData>();

function getOrCreateRoom(roomId: string): RoomData {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      elements: [],
      users: new Map(),
      messages: [],
    });
  }
  return rooms.get(roomId)!;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  
  // Set up Socket.IO on the server
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Health check API
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', rooms: rooms.size });
  });

  // Socket.IO event handling
  io.on('connection', (socket: Socket) => {
    let currentRoomId = 'default';
    let userName = 'Anonymous';
    let userColor = '#3b82f6'; // Default blue

    // 1. Join room
    socket.on('room:join', ({ roomId, name, color }: { roomId: string; name: string; color: string }) => {
      // Leave previous room if any
      if (currentRoomId) {
        socket.leave(currentRoomId);
        const prevRoom = rooms.get(currentRoomId);
        if (prevRoom) {
          prevRoom.users.delete(socket.id);
          io.to(currentRoomId).emit('room:users', Array.from(prevRoom.users.values()));
        }
      }

      currentRoomId = roomId || 'default';
      userName = name || 'Anonymous';
      userColor = color || '#3b82f6';

      socket.join(currentRoomId);
      const room = getOrCreateRoom(currentRoomId);

      // Add user to room
      const user: User = {
        id: socket.id,
        name: userName,
        color: userColor,
        cursor: null,
      };
      room.users.set(socket.id, user);

      // Send initial history and current user list to the joining client
      socket.emit('room:init', {
        elements: room.elements,
        messages: room.messages,
        users: Array.from(room.users.values()),
        myId: socket.id
      });

      // Broadcast updated user list to everyone in the room
      io.to(currentRoomId).emit('room:users', Array.from(room.users.values()));

      // System message
      const systemMsg: ChatMessage = {
        id: `system-${Date.now()}-${Math.random()}`,
        userId: 'system',
        userName: 'System',
        userColor: '#9ca3af',
        text: `${userName} joined the whiteboard.`,
        timestamp: Date.now()
      };
      room.messages.push(systemMsg);
      io.to(currentRoomId).emit('chat:message', systemMsg);
    });

    // 2. Cursor move (throttled on client, broadcast to others)
    socket.on('cursor:move', (position: { x: number; y: number } | null) => {
      const room = rooms.get(currentRoomId);
      if (room) {
        const user = room.users.get(socket.id);
        if (user) {
          user.cursor = position;
          // Send cursor update to other users in the room
          socket.to(currentRoomId).emit('cursor:update', {
            userId: socket.id,
            cursor: position,
          });
        }
      }
    });

    // 3. Drawing progress (active drawing stream, not saved in history yet)
    socket.on('draw:progress', (stroke: any) => {
      socket.to(currentRoomId).emit('draw:progress_update', {
        userId: socket.id,
        stroke,
      });
    });

    // 4. Drawing committed (saved to room history)
    socket.on('draw:commit', (element: DrawElement) => {
      const room = rooms.get(currentRoomId);
      if (room) {
        if (element && element.id) {
          room.elements.push(element);
          socket.to(currentRoomId).emit('draw:committed', element);
        }
      }
    });

    // 5. Canvas clear
    socket.on('canvas:clear', () => {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.elements = [];
        io.to(currentRoomId).emit('canvas:cleared');
      }
    });

    // 6. Undo
    socket.on('draw:undo', () => {
      const room = rooms.get(currentRoomId);
      if (room) {
        // Find last element created by this user
        const index = [...room.elements].reverse().findIndex(el => el.userId === socket.id);
        if (index !== -1) {
          const actualIndex = room.elements.length - 1 - index;
          const removed = room.elements.splice(actualIndex, 1)[0];
          io.to(currentRoomId).emit('draw:undone', { elementId: removed.id });
        } else if (room.elements.length > 0) {
          // If no elements by this user, undo the absolute last element
          const removed = room.elements.pop()!;
          io.to(currentRoomId).emit('draw:undone', { elementId: removed.id });
        }
      }
    });

    // 7. Chat messages
    socket.on('chat:send', (text: string) => {
      const room = rooms.get(currentRoomId);
      if (room) {
        const msg: ChatMessage = {
          id: `${socket.id}-${Date.now()}`,
          userId: socket.id,
          userName,
          userColor,
          text,
          timestamp: Date.now()
        };
        room.messages.push(msg);
        io.to(currentRoomId).emit('chat:message', msg);
      }
    });

    // 8. User leaves or disconnects
    socket.on('disconnect', () => {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.users.delete(socket.id);
        io.to(currentRoomId).emit('room:users', Array.from(room.users.values()));
        io.to(currentRoomId).emit('cursor:update', {
          userId: socket.id,
          cursor: null,
        });

        const systemMsg: ChatMessage = {
          id: `system-${Date.now()}-${Math.random()}`,
          userId: 'system',
          userName: 'System',
          userColor: '#9ca3af',
          text: `${userName} left the whiteboard.`,
          timestamp: Date.now()
        };
        room.messages.push(systemMsg);
        io.to(currentRoomId).emit('chat:message', systemMsg);
      }
    });
  });

  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

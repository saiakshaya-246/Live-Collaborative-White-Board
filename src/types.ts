export interface DrawElement {
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

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  timestamp: number;
}

export interface User {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number } | null;
}

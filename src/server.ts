import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import connectDB from './config/database';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import quizRoutes from './routes/quiz.routes';
import friendsRoutes from './routes/friends.routes';
import gameRoutes from './routes/game.routes';
import { setupGameHandlers } from './sockets/gameHandlers';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) || 4000 : 4000;

// Socket.io JWT authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: string; email: string };
    socket.data.userId = decoded.userId;
    socket.data.email = decoded.email;
    next();
  } catch {
    next(new Error('Authentication error: Invalid token'));
  }
});

// Set up game socket handlers
setupGameHandlers(io);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/game', gameRoutes);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found.' });
});
app.use(errorHandler);

const FALLBACK_PORT = 4000;

function tryListen(port: number): void {
  httpServer.listen(port, () => {
    console.log(`[server] Boulder API running on http://localhost:${port}`);
    console.log(`[socket.io] WebSocket server ready`);
  });
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && port !== FALLBACK_PORT) {
      httpServer.close();
      console.warn(`[server] Port ${port} in use, trying ${FALLBACK_PORT}...`);
      tryListen(FALLBACK_PORT);
    } else {
      console.error('[server] Failed to start:', err);
      process.exit(1);
    }
  });
}

async function start(): Promise<void> {
  await connectDB();
  tryListen(PORT);
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});

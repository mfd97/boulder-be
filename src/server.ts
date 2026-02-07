import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './config/database';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import quizRoutes from './routes/quiz.routes';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) || 4000 : 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/quiz', quizRoutes);

app.get('/api/health', (_req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found.' });
});
app.use(errorHandler);

const FALLBACK_PORT = 4000;

function tryListen(port: number): void {
  const server = app.listen(port, () => {
    console.log(`[server] Boulder API running on http://localhost:${port}`);
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && port !== FALLBACK_PORT) {
      server.close();
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

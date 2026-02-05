// backend/src/server.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/database';
import morgan from "morgan"

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
// import analyticsRoutes from './routes/analytics'; // Removed: module not found
// ... باقي الـ routes

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(morgan("dev"))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
connectDB();

// Routes
app.use('/api/auth', authRoutes);           // 🔐 Auth routes
app.use('/api/users', userRoutes);
// app.use('/api/analytics', analyticsRoutes); // Removed: analyticsRoutes not defined
// ... باقي الـ routes

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  getPendingInvitations,
  getActiveGame,
  getGameById,
  getGameHistory,
  getPendingCount,
} from '../controllers/game.controllers';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get pending game invitations
router.get('/invitations', getPendingInvitations);

// Get count of pending invitations
router.get('/invitations/count', getPendingCount);

// Get active game (if any)
router.get('/active', getActiveGame);

// Get game history
router.get('/history', getGameHistory);

// Get specific game by ID
router.get('/:id', getGameById);

export default router;

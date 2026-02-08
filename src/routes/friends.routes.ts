import { Router } from 'express';
import {
  sendFriendRequest,
  getPendingRequests,
  getSentRequests,
  acceptFriendRequest,
  declineFriendRequest,
  getFriends,
  removeFriend,
  getFriendsLeaderboard,
  getPendingCount,
} from '../controllers/friends.controllers';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Friend request operations
router.post('/request', sendFriendRequest);
router.get('/pending', getPendingRequests);
router.get('/pending/count', getPendingCount);
router.get('/sent', getSentRequests);
router.post('/accept/:id', acceptFriendRequest);
router.post('/decline/:id', declineFriendRequest);

// Friend list operations
router.get('/', getFriends);
router.delete('/:id', removeFriend);

// Leaderboard
router.get('/leaderboard', getFriendsLeaderboard);

export default router;

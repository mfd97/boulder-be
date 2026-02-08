import { Router } from 'express';
import { getMe, getAllUsers, updateProfile } from '../controllers/userController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get('/', getAllUsers);
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateProfile);

export default router;

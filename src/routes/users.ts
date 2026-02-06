import { Router } from 'express';
import { getMe, getAllUsers } from '../controllers/userController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.get('/', getAllUsers);
router.get('/me', authenticate, getMe);

export default router;

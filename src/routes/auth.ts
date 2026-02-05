import { Router } from 'express';
import { register, login, logout } from '../controllers/userController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate, logout);

export default router;

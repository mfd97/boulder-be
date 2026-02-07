import { Router, Request, Response } from 'express';
import { register, login } from '../controllers/userController';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', (_req: Request, res: Response) => {
  // Token-based auth doesn't require server-side logout
  // The client just needs to delete the token locally
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export default router;

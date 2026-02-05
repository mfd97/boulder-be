import { Router } from 'express';
import { recordActiveUserHandler } from '../controllers/analyticsController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/active', authenticate, recordActiveUserHandler);

export default router;

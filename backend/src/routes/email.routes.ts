import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { listEmails } from '../controllers/email.controller.js';

const router = Router();

router.get('/', authMiddleware, listEmails);

export default router;

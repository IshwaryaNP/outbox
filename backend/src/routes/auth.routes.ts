import { Router } from 'express';
import {
  initiateGoogleAuth,
  googleAuthCallback,
  getCurrentUser,
  logoutUser,
} from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/google', initiateGoogleAuth);
router.get('/google/callback', googleAuthCallback);
router.get('/me', authMiddleware, getCurrentUser);
router.post('/logout', logoutUser);

export default router;

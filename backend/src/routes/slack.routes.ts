import { Router } from 'express';
import {
  connectSlack,
  slackCallback,
  disconnectSlack,
  getSlackStatus,
} from '../controllers/slack.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/connect', authMiddleware, connectSlack);
router.get('/callback', slackCallback);
router.delete('/disconnect', authMiddleware, disconnectSlack);
router.get('/status', authMiddleware, getSlackStatus);

export default router;

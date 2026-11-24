import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { scheduleCampaign } from '../controllers/campaign.controller.js';

const router = Router();

router.post('/schedule', authMiddleware, scheduleCampaign);

export default router;

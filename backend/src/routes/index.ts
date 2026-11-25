import { Router, Request, Response } from 'express';
import campaignRoutes from './campaign.routes.js';
import emailRoutes from './email.routes.js';
import authRoutes from './auth.routes.js';
import slackRoutes from './slack.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/slack', slackRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/emails', emailRoutes);
router.use('/admin', adminRoutes);

export default router;

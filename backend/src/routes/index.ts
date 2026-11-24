import { Router, Request, Response } from 'express';
import campaignRoutes from './campaign.routes.js';
import emailRoutes from './email.routes.js';

const router = Router();

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/campaigns', campaignRoutes);
router.use('/emails', emailRoutes);

export default router;

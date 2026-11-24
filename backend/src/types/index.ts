import { EmailStatus } from '@prisma/client';

export interface EmailJobData {
  emailId: string;
  campaignId: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string; // ISO string
}

export interface ScheduleCampaignBody {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string; // ISO string
  delayMs: number;
  hourlyLimit: number;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
  status?: EmailStatus;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

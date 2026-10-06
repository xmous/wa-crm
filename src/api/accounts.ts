import { Router, Request, Response } from 'express';
import { prisma } from '../database/client';
import { SessionManager } from '../whatsapp/session-manager';
import QRCode from 'qrcode';

export const accountRouter = Router();

// List all accounts
accountRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.whatsappAccount.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, data: accounts });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Create new account and trigger pairing
accountRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { labelName, dailyLimit } = req.body;
    if (!labelName) {
      return res.status(400).json({ error: 'Label name is required' });
    }

    const account = await prisma.whatsappAccount.create({
      data: {
        labelName,
        dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : 150,
        status: 'DISCONNECTED'
      }
    });

    // Asynchronously trigger session start
    SessionManager.initSession(account.id).catch(err => {
      console.warn(`Initial session error for account ${account.id}:`, err);
    });

    return res.status(201).json({ success: true, data: account });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Trigger reconnect / QR generation for an account
accountRouter.post('/:id/connect', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    SessionManager.initSession(id).catch(err => {
      console.warn(`Session connect error for ${id}:`, err);
    });
    return res.json({ success: true, message: 'Connection sequence started.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

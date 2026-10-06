import { Router, Request, Response } from 'express';
import { prisma } from '../database/client';
import { parseSpintax } from '../utils/spintax';
import { formatE164 } from '../utils/phone';

export const campaignRouter = Router();

campaignRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const campaigns = await prisma.broadcastCampaign.findMany({
      include: {
        _count: {
          select: { queues: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, data: campaigns });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

campaignRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { title, messageTemplate, recipients, whatsappAccountId } = req.body;

    if (!title || !messageTemplate || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'Title, messageTemplate, and recipients array are required' });
    }

    // Default account if not specified
    let targetAccountId = whatsappAccountId;
    if (!targetAccountId) {
      const activeAccount = await prisma.whatsappAccount.findFirst({ where: { status: 'CONNECTED' } });
      targetAccountId = activeAccount ? activeAccount.id : (await prisma.whatsappAccount.findFirst())?.id;
    }

    if (!targetAccountId) {
      return res.status(400).json({ error: 'No WhatsApp account available to bind broadcast queues.' });
    }

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        title,
        messageTemplate,
        status: 'PROCESSING',
        totalTargets: recipients.length
      }
    });

    const queueItems = recipients.map((r: { phone: string; name?: string }) => {
      const { cleanNumber } = formatE164(r.phone);
      let rendered = parseSpintax(messageTemplate);
      if (r.name) {
        rendered = rendered.replace(/\{name\}/gi, r.name);
      }
      return {
        campaignId: campaign.id,
        whatsappAccountId: targetAccountId,
        recipientPhone: cleanNumber,
        renderedText: rendered,
        status: 'QUEUED' as const
      };
    });

    await prisma.broadcastQueue.createMany({
      data: queueItems
    });

    return res.status(201).json({
      success: true,
      data: campaign,
      totalQueued: queueItems.length
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

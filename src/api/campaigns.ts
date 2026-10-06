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

    // Parse recipients flexibly: string ("0812345678", "0812345678, Budi", "0812345678 - Budi") or object ({ phone, name })
    interface RecipientInput {
      phone: string;
      name?: string;
    }
    const parsedRecipients: RecipientInput[] = [];

    for (const r of recipients) {
      if (typeof r === 'string') {
        const trimmed = r.trim();
        if (!trimmed) continue;
        if (trimmed.includes(',')) {
          const parts = trimmed.split(',').map(s => s.trim());
          parsedRecipients.push({ phone: parts[0], name: parts.slice(1).join(' ').trim() || undefined });
        } else if (trimmed.includes(';')) {
          const parts = trimmed.split(';').map(s => s.trim());
          parsedRecipients.push({ phone: parts[0], name: parts.slice(1).join(' ').trim() || undefined });
        } else if (trimmed.includes(' - ')) {
          const parts = trimmed.split(' - ').map(s => s.trim());
          parsedRecipients.push({ phone: parts[0], name: parts.slice(1).join(' ').trim() || undefined });
        } else if (trimmed.includes('\t')) {
          const parts = trimmed.split('\t').map(s => s.trim());
          parsedRecipients.push({ phone: parts[0], name: parts.slice(1).join(' ').trim() || undefined });
        } else {
          parsedRecipients.push({ phone: trimmed });
        }
      } else if (r && typeof r === 'object') {
        const phone = r.phone || r.phoneNumber || '';
        if (phone) {
          parsedRecipients.push({
            phone: String(phone).trim(),
            name: r.name ? String(r.name).trim() : undefined
          });
        }
      }
    }

    if (parsedRecipients.length === 0) {
      return res.status(400).json({ error: 'Daftar nomor penerima tidak valid atau kosong.' });
    }

    // Clean phone numbers and validate
    const validTargets: { cleanNumber: string; name?: string }[] = [];
    for (const item of parsedRecipients) {
      if (!item.phone) continue;
      const { cleanNumber, isValid } = formatE164(item.phone);
      if (cleanNumber && (isValid || cleanNumber.length >= 10)) {
        validTargets.push({ cleanNumber, name: item.name });
      }
    }

    if (validTargets.length === 0) {
      return res.status(400).json({ error: 'Tidak ada nomor telepon WhatsApp yang valid ditemukan.' });
    }

    // Lookup contact names from DB if name wasn't explicitly provided
    const uniqueNumbers = Array.from(new Set(validTargets.map(t => t.cleanNumber)));
    const contactsInDb = await prisma.contact.findMany({
      where: { phoneNumber: { in: uniqueNumbers } }
    });
    const contactMap = new Map<string, string>();
    for (const c of contactsInDb) {
      if (c.name && c.name.trim()) {
        contactMap.set(c.phoneNumber, c.name.trim());
      }
    }

    const campaign = await prisma.broadcastCampaign.create({
      data: {
        title,
        messageTemplate,
        status: 'PROCESSING',
        totalTargets: validTargets.length
      }
    });

    const queueItems = validTargets.map(target => {
      const contactName = target.name || contactMap.get(target.cleanNumber) || '';
      let rendered = parseSpintax(messageTemplate);

      if (contactName) {
        rendered = rendered.replace(/\{nama\}|\{name\}/gi, contactName);
      } else {
        // Fallback: cleanly remove placeholder if contact has no name
        rendered = rendered.replace(/\s*\{nama\}|\s*\{name\}/gi, '');
      }

      return {
        campaignId: campaign.id,
        whatsappAccountId: targetAccountId,
        recipientPhone: target.cleanNumber,
        renderedText: rendered.trim(),
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

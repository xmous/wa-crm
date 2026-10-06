import { Router, Request, Response } from 'express';
import { prisma } from '../database/client';

export const reportRouter = Router();

// Summary overview metrics
reportRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    const [totalContacts, liveMessages, botReplies, agentReplies, totalCampaigns, broadcastSent] = await Promise.all([
      prisma.contact.count(),
      prisma.message.count(),
      prisma.message.count({ where: { senderType: 'BOT' } }),
      prisma.message.count({ where: { senderType: 'AGENT' } }),
      prisma.broadcastCampaign.count(),
      prisma.broadcastQueue.count({ where: { status: 'SENT' } })
    ]);

    const totalMessages = liveMessages + broadcastSent;

    return res.json({
      success: true,
      data: {
        totalContacts,
        totalMessages,
        liveMessages,
        broadcastSent,
        botReplies,
        agentReplies,
        totalCampaigns
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Agent productivity metrics
reportRouter.get('/agents', async (_req: Request, res: Response) => {
  try {
    const agents = await prisma.user.findMany({
      where: { role: 'AGENT' },
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            sentMessages: true,
            conversations: true
          }
        }
      }
    });

    return res.json({ success: true, data: agents });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// WhatsApp accounts health and traffic
reportRouter.get('/accounts', async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.whatsappAccount.findMany({
      select: {
        id: true,
        labelName: true,
        phoneNumber: true,
        status: true,
        dailyLimit: true,
        sentToday: true,
        lastResetDate: true
      }
    });

    return res.json({ success: true, data: accounts });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Export messages audit log to CSV
reportRouter.get('/export-csv', async (_req: Request, res: Response) => {
  try {
    const messages = await prisma.message.findMany({
      take: 500,
      orderBy: { createdAt: 'desc' },
      include: {
        conversation: {
          include: {
            contact: true,
            whatsappAccount: true
          }
        }
      }
    });

    let csv = 'ID,Waktu,Arah,Pengirim,Nama_Staf,Nomor_Pelanggan,Akun_WA,Status,Pesan\n';
    for (const m of messages) {
      const sanitizedText = `"${m.text.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
      const staff = m.agentNameSnapshot || (m.senderType === 'BOT' ? 'BOT_SYSTEM' : '-');
      const contactPhone = m.conversation.contact.phoneNumber;
      const accountLabel = m.conversation.whatsappAccount.labelName;
      csv += `${m.id},${m.createdAt.toISOString()},${m.direction},${m.senderType},"${staff}",${contactPhone},"${accountLabel}",${m.status},${sanitizedText}\n`;
    }

    res.header('Content-Type', 'text/csv');
    res.attachment(`audit-laporan-wa-${new Date().toISOString().slice(0, 10)}.csv`);
    return res.send(csv);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

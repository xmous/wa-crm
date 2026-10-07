import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../database/client';
import { SessionManager } from '../whatsapp/session-manager';
import { requireApiKey } from '../middleware/api-key';

export const gatewayRouter = Router();

// Protect all /api/v1 routes with API Key
gatewayRouter.use(requireApiKey);

// Validation schema for send message & media
const SendMessageSchema = z.object({
  phone: z.string().min(8, 'Nomor telepon minimal 8 karakter'),
  message: z.string().optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  mediaUrl: z.string().url('mediaUrl harus berupa URL valid yang dapat diunduh').optional(),
  mediaType: z.enum(['image', 'document', 'video', 'audio', 'auto']).optional(),
  fileName: z.string().optional(),
  mimetype: z.string().optional(),
  sender: z.string().optional(),
  senderPhone: z.string().optional(),
  accountId: z.string().optional()
}).refine(data => data.message || data.text || data.mediaUrl, {
  message: 'Wajib menyertakan "message" (untuk teks) atau "mediaUrl" (untuk lampiran berkas/gambar)'
});

/**
 * Check gateway health & active WhatsApp accounts
 * GET /api/v1/status
 */
gatewayRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.whatsappAccount.findMany({
      select: {
        id: true,
        labelName: true,
        phoneNumber: true,
        status: true,
        sentToday: true,
        dailyLimit: true
      }
    });

    const activeSessions = SessionManager.getActiveSessions();
    const readyAccounts = accounts.filter(acc => 
      acc.status === 'CONNECTED' && activeSessions.includes(acc.id)
    );

    return res.json({
      success: true,
      gateway: 'WA-CRM Pro API Gateway',
      version: '1.0.0',
      connectedAccountsCount: readyAccounts.length,
      accounts: accounts.map(acc => ({
        ...acc,
        isSocketReady: activeSessions.includes(acc.id)
      }))
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Send text message or media (Image, PDF, Document)
 * POST /api/v1/messages/send
 * Alias: POST /api/v1/send
 */
const handleSend = async (req: Request, res: Response) => {
  try {
    const parseResult = SendMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validasi gagal',
        details: parseResult.error.format()
      });
    }

    const {
      phone,
      message,
      text,
      caption,
      mediaUrl,
      mediaType,
      fileName,
      mimetype,
      sender,
      senderPhone,
      accountId
    } = parseResult.data;

    const messageContent = (message || text || '').trim();
    const mediaCaption = caption || messageContent;

    // 1. Clean & normalize target phone number to WhatsApp JID
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    }
    const toJid = `${cleanPhone}@s.whatsapp.net`;

    // 2. Resolve sender WhatsApp account
    let targetAccount = null;
    const requestedSender = (accountId || sender || senderPhone || '').trim();

    if (requestedSender) {
      targetAccount = await prisma.whatsappAccount.findFirst({
        where: {
          OR: [
            { id: requestedSender },
            { phoneNumber: { contains: requestedSender.replace(/\D/g, '') } },
            { labelName: { equals: requestedSender, mode: 'insensitive' } }
          ]
        }
      });
    }

    if (!targetAccount) {
      // Auto-select first connected account
      const connected = await prisma.whatsappAccount.findMany({
        where: { status: 'CONNECTED' },
        orderBy: { sentToday: 'asc' }
      });
      
      const activeIds = SessionManager.getActiveSessions();
      targetAccount = connected.find(a => activeIds.includes(a.id)) || null;
    }

    if (!targetAccount) {
      return res.status(503).json({
        success: false,
        error: 'Tidak ada akun WhatsApp yang sedang terhubung di server. Silakan hubungkan akun WhatsApp melalui dashboard CRM.'
      });
    }

    const socket = SessionManager.getSocket(targetAccount.id);
    if (!socket) {
      return res.status(503).json({
        success: false,
        error: `Sesi WhatsApp untuk akun "${targetAccount.labelName}" sedang terputus atau sinkronisasi ulang.`
      });
    }

    // 3. Human typing presence simulation (Anti-Ban safeguard)
    try {
      await SessionManager.simulateTyping(targetAccount.id, toJid, 1200);
    } catch (presenceErr) {
      // Ignore typing presence errors, proceed with send
    }

    // 4. Send message or media via Baileys
    let sendResult: any = null;
    if (mediaUrl) {
      sendResult = await SessionManager.sendMedia(targetAccount.id, toJid, {
        mediaUrl,
        caption: mediaCaption,
        mediaType: mediaType || 'auto',
        fileName,
        mimetype
      });
      console.log(`📤 [API Gateway Media] Berhasil terkirim ke ${cleanPhone} via ${targetAccount.labelName}: ${mediaUrl}`);
    } else {
      sendResult = await SessionManager.sendMessage(targetAccount.id, toJid, messageContent);
      console.log(`📤 [API Gateway Text] Berhasil terkirim ke ${cleanPhone} via ${targetAccount.labelName}: "${messageContent}"`);
    }

    // 5. Upsert Contact & Conversation so it appears in CRM Live Chat
    let contact = await prisma.contact.findFirst({
      where: { phoneNumber: cleanPhone }
    });
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          phoneNumber: cleanPhone,
          name: cleanPhone
        }
      });
    }

    let conversation = await prisma.conversation.findFirst({
      where: {
        contactId: contact.id,
        whatsappAccountId: targetAccount.id
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          whatsappAccountId: targetAccount.id,
          status: 'BOT_ACTIVE',
          lastMessageAt: new Date()
        }
      });
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() }
      });
    }

    // 6. Record outbound message in database
    const recordedText = mediaUrl
      ? (mediaCaption ? `📎 [Media: ${fileName || mediaUrl}] ${mediaCaption}` : `📎 [Media: ${fileName || mediaUrl}]`)
      : messageContent;

    const dbMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        agentNameSnapshot: `🤖 API Gateway (${targetAccount.labelName})`,
        text: recordedText,
        status: 'SENT'
      }
    });

    // 7. Increment daily message count
    await prisma.whatsappAccount.update({
      where: { id: targetAccount.id },
      data: { sentToday: { increment: 1 } }
    });

    return res.json({
      success: true,
      message: 'Pesan berhasil dikirim via WhatsApp',
      data: {
        messageId: dbMessage.id,
        waMessageId: sendResult?.key?.id || null,
        to: cleanPhone,
        toJid,
        senderAccount: {
          id: targetAccount.id,
          label: targetAccount.labelName,
          phoneNumber: targetAccount.phoneNumber
        },
        type: mediaUrl ? (mediaType || 'media') : 'text',
        sentAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('API Gateway Send Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Gagal mengirim pesan WhatsApp: ' + error.message
    });
  }
};

gatewayRouter.post('/messages/send', handleSend);
gatewayRouter.post('/send', handleSend);

import { Router, Request, Response } from 'express';
import { prisma } from '../database/client';
import { SessionManager } from '../whatsapp/session-manager';

export const conversationRouter = Router();

// Get list of active agents (for admin dropdown filter and assignment)
conversationRouter.get('/agents', async (_req: Request, res: Response) => {
  try {
    const agents = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' }
    });
    return res.json({ success: true, data: agents });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// List all conversations
conversationRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, assignedAgentId } = req.query;
    const where: any = {};
    if (status) where.status = String(status);
    if (assignedAgentId) where.assignedAgentId = String(assignedAgentId);

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        contact: true,
        assignedAgent: { select: { id: true, name: true, email: true } },
        whatsappAccount: { select: { id: true, labelName: true, phoneNumber: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { lastMessageAt: 'desc' }
    });

    return res.json({ success: true, data: conversations });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Get single conversation details with messages
conversationRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        assignedAgent: { select: { id: true, name: true, email: true } },
        whatsappAccount: { select: { id: true, labelName: true, phoneNumber: true } },
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    return res.json({ success: true, data: conversation });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Reply to conversation (Multi-Agent CS tracking: "Siapa yang balas")
conversationRouter.post('/:id/reply', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text, agentId, agentName, agentNameSnapshot } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { contact: true }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const rawTarget = conversation.contact.phoneNumber;
    let toJid = rawTarget;
    if (!rawTarget.includes('@')) {
      if (!rawTarget.startsWith('62') && !rawTarget.startsWith('0') && rawTarget.length >= 13) {
        toJid = `${rawTarget}@lid`;
      } else {
        let clean = rawTarget.replace(/\D/g, '');
        if (clean.startsWith('0')) clean = '62' + clean.slice(1);
        toJid = `${clean}@s.whatsapp.net`;
      }
    }

    // 1. Send via WhatsApp (with human typing presence simulation)
    try {
      await SessionManager.simulateTyping(conversation.whatsappAccountId, toJid, 1000);
      await SessionManager.sendMessage(conversation.whatsappAccountId, toJid, text);
      console.log(`📤 [CS Live Reply] Berhasil terkirim ke ${toJid}: "${text}"`);
    } catch (sendErr: any) {
      console.warn(`Direct send to ${toJid} failed (${sendErr.message}), mencoba rute alternatif...`);
      const altJid = toJid.endsWith('@lid')
        ? `${rawTarget.replace(/\D/g, '')}@s.whatsapp.net`
        : `${rawTarget}@lid`;
      try {
        await SessionManager.sendMessage(conversation.whatsappAccountId, altJid, text);
        console.log(`📤 [CS Live Reply Fallback] Berhasil terkirim via ${altJid}: "${text}"`);
      } catch (fallbackErr: any) {
        console.error('All send attempts failed:', fallbackErr.message);
      }
    }

    // 2. Resolve Agent Name & Record Message
    const effectiveAgentId = agentId || req.user?.id || null;
    let resolvedAgentName = req.user?.name || agentNameSnapshot || agentName;
    if (!resolvedAgentName && effectiveAgentId) {
      const dbUser = await prisma.user.findUnique({ where: { id: effectiveAgentId }, select: { name: true } });
      if (dbUser) resolvedAgentName = dbUser.name;
    }

    const account = await prisma.whatsappAccount.findUnique({ where: { id: conversation.whatsappAccountId } });
    const staffLabel = `🎧 CS ${resolvedAgentName || 'Customer Service'} (${account?.labelName || 'WA'})`;

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        agentId: effectiveAgentId,
        agentNameSnapshot: staffLabel,
        text,
        status: 'SENT'
      }
    });

    // 3. Update conversation status
    await prisma.conversation.update({
      where: { id },
      data: {
        assignedAgentId: effectiveAgentId || conversation.assignedAgentId,
        status: 'AGENT_ASSIGNED',
        lastMessageAt: new Date()
      }
    });

    return res.json({ success: true, message });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Assign or reassign conversation to agent (or release to unassigned queue)
conversationRouter.post('/:id/assign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        assignedAgentId: agentId || null,
        status: agentId ? 'AGENT_ASSIGNED' : 'NEEDS_AGENT'
      }
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Close / Resolve conversation
conversationRouter.post('/:id/close', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        lastMessageAt: new Date()
      }
    });

    const closerName = req.user?.name || 'Customer Service';
    await prisma.message.create({
      data: {
        conversationId: id,
        direction: 'OUTBOUND',
        senderType: 'SYSTEM',
        agentNameSnapshot: `🔒 Sesi Diselesaikan`,
        text: `Sesi percakapan diselesaikan oleh ${closerName}.`,
        status: 'SENT'
      }
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Reopen a resolved conversation
conversationRouter.post('/:id/reopen', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        status: 'NEEDS_AGENT',
        lastMessageAt: new Date()
      }
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Rename / update contact name for this conversation
conversationRouter.patch('/:id/contact', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Nama kontak tidak boleh kosong.' });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { contactId: true }
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const updatedContact = await prisma.contact.update({
      where: { id: conversation.contactId },
      data: { name: name.trim() }
    });

    return res.json({ success: true, contact: updatedContact });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

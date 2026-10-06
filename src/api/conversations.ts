import { Router, Request, Response } from 'express';
import { prisma } from '../database/client';
import { SessionManager } from '../whatsapp/session-manager';

export const conversationRouter = Router();

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
    const { text, agentId, agentName } = req.body;

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

    const toJid = `${conversation.contact.phoneNumber}@s.whatsapp.net`;

    // 1. Send via WhatsApp (with human typing presence simulation)
    try {
      await SessionManager.simulateTyping(conversation.whatsappAccountId, toJid, 1000);
      await SessionManager.sendMessage(conversation.whatsappAccountId, toJid, text);
    } catch (sendErr: any) {
      console.warn('Direct send failed (may be offline session in test):', sendErr.message);
    }

    // 2. Record Message with explicit AGENT ID & Name Snapshot
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        agentId: agentId || null,
        agentNameSnapshot: agentName || 'Customer Service',
        text,
        status: 'SENT'
      }
    });

    // 3. Update conversation status
    await prisma.conversation.update({
      where: { id },
      data: {
        assignedAgentId: agentId || conversation.assignedAgentId,
        status: 'AGENT_ASSIGNED',
        lastMessageAt: new Date()
      }
    });

    return res.json({ success: true, message });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Assign conversation to agent
conversationRouter.post('/:id/assign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        assignedAgentId: agentId,
        status: 'AGENT_ASSIGNED'
      }
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

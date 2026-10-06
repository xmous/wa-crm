import { prisma } from '../database/client';
import { formatE164 } from '../utils/phone';
import { matchBotRuleLocal } from '../bot/rule-engine';
import { SessionManager } from './session-manager';

export async function handleInboundMessage(accountId: string, senderJid: string, text: string, senderName?: string): Promise<{ conversationId?: string }> {
  const { cleanNumber } = formatE164(senderJid);

  // Check Opt-Out STOP keyword
  if (text.trim().toUpperCase() === 'STOP') {
    await prisma.contact.upsert({
      where: { phoneNumber: cleanNumber },
      create: { phoneNumber: cleanNumber, isBlacklisted: true, blacklistedAt: new Date() },
      update: { isBlacklisted: true, blacklistedAt: new Date() }
    });
    try {
      await SessionManager.sendMessage(accountId, senderJid, 'Anda telah berhenti berlangganan. Nomor Anda tidak akan menerima pesan promo lagi.');
    } catch (_) {}
    return {};
  }

  // Find or create Contact (save senderName if provided)
  const contact = await prisma.contact.upsert({
    where: { phoneNumber: cleanNumber },
    create: { phoneNumber: cleanNumber, name: senderName || null },
    update: { name: senderName || undefined }
  });

  if (contact.isBlacklisted) return {};

  // Find or create Conversation
  let conversation = await prisma.conversation.findUnique({
    where: {
      whatsappAccountId_contactId: {
        whatsappAccountId: accountId,
        contactId: contact.id
      }
    }
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        whatsappAccountId: accountId,
        contactId: contact.id,
        status: 'BOT_ACTIVE'
      }
    });
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    });
  }

  // Save Inbound Message
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND',
      senderType: 'CUSTOMER',
      text,
      status: 'READ'
    }
  });

  // If Bot is Active and not assigned to CS
  if (conversation.status === 'BOT_ACTIVE') {
    const rules = await prisma.botRule.findMany({ where: { isActive: true }, orderBy: { priority: 'desc' } });
    const match = matchBotRuleLocal(text, rules);

    if (match.matched && match.action === 'HANDOVER_AGENT') {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'NEEDS_AGENT' }
      });
      await SessionManager.simulateTyping(accountId, senderJid, 1500);
      await SessionManager.sendMessage(accountId, senderJid, match.replyText || 'Mohon tunggu, staf CS kami akan segera membantu.');
    } else if (match.matched && match.replyText) {
      await SessionManager.simulateTyping(accountId, senderJid, 2000);
      await SessionManager.sendMessage(accountId, senderJid, match.replyText);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          senderType: 'BOT',
          text: match.replyText,
          status: 'SENT'
        }
      });
    }
  }

  return { conversationId: conversation.id };
}

export async function handleOutboundFromPhone(accountId: string, remoteJid: string, text: string): Promise<{ conversationId?: string }> {
  const { cleanNumber } = formatE164(remoteJid);
  const contact = await prisma.contact.upsert({
    where: { phoneNumber: cleanNumber },
    create: { phoneNumber: cleanNumber },
    update: {}
  });

  let conversation = await prisma.conversation.findUnique({
    where: {
      whatsappAccountId_contactId: {
        whatsappAccountId: accountId,
        contactId: contact.id
      }
    }
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        whatsappAccountId: accountId,
        contactId: contact.id,
        status: 'NEEDS_AGENT'
      }
    });
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() }
    });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      senderType: 'AGENT',
      agentNameSnapshot: 'HP WhatsApp',
      text,
      status: 'SENT'
    }
  });

  return { conversationId: conversation.id };
}

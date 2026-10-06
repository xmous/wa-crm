import { prisma } from '../database/client';
import { SessionManager } from '../whatsapp/session-manager';
import { getRandomDelay, sleep } from '../utils/delay';
import { config } from '../config';

export class QueueDispatcher {
  private static isRunning = false;
  private static consecutiveSent = 0;

  static async selectNextAvailableAccount(): Promise<string | null> {
    try {
      const accounts = await prisma.whatsappAccount.findMany({
        where: {
          status: 'CONNECTED',
        }
      });

      for (const acc of accounts) {
        if (acc.sentToday < acc.dailyLimit) {
          return acc.id;
        }
      }
    } catch (err) {
      console.warn('Error finding available account:', err);
    }
    return null;
  }

  static async processNext(): Promise<boolean> {
    if (this.isRunning) return false;
    this.isRunning = true;

    try {
      const job = await prisma.broadcastQueue.findFirst({
        where: { status: 'QUEUED' },
        include: { campaign: true }
      });

      if (!job) {
        this.isRunning = false;
        return false;
      }

      // Check account availability & rotation
      let accountId: string | null = job.whatsappAccountId;
      const account = await prisma.whatsappAccount.findUnique({ where: { id: accountId } });

      if (!account || account.status !== 'CONNECTED' || account.sentToday >= account.dailyLimit) {
        accountId = await this.selectNextAvailableAccount();
        if (!accountId) {
          this.isRunning = false;
          return false;
        }
      }

      // Mark PENDING
      await prisma.broadcastQueue.update({
        where: { id: job.id },
        data: { status: 'PENDING', whatsappAccountId: accountId }
      });

      // 1. Simulate Human Presence Typing
      let toJid = job.recipientPhone;
      if (!toJid.includes('@')) {
        if (!toJid.startsWith('62') && !toJid.startsWith('0') && toJid.length >= 13) {
          toJid = `${toJid}@lid`;
        } else {
          let clean = toJid.replace(/\D/g, '');
          if (clean.startsWith('0')) clean = '62' + clean.slice(1);
          toJid = `${clean}@s.whatsapp.net`;
        }
      }
      await SessionManager.simulateTyping(accountId, toJid, 2000);

      // 2. Dispatch Message with dual-fallback protection
      try {
        try {
          await SessionManager.sendMessage(accountId, toJid, job.renderedText);
        } catch (firstErr: any) {
          console.warn(`[Broadcast] Gagal kirim ke ${toJid} (${firstErr.message}), mencoba rute alternatif...`);
          const altJid = toJid.endsWith('@lid')
            ? `${job.recipientPhone.replace(/\D/g, '')}@s.whatsapp.net`
            : `${job.recipientPhone}@lid`;
          await SessionManager.sendMessage(accountId, altJid, job.renderedText);
        }

        // 3. Update Database records on success
        const [_, __, updatedCampaign] = await prisma.$transaction([
          prisma.broadcastQueue.update({
            where: { id: job.id },
            data: { status: 'SENT', sentAt: new Date() }
          }),
          prisma.whatsappAccount.update({
            where: { id: accountId },
            data: { sentToday: { increment: 1 } }
          }),
          prisma.broadcastCampaign.update({
            where: { id: job.campaignId },
            data: { sentCount: { increment: 1 } }
          })
        ]);

        if (updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalTargets) {
          await prisma.broadcastCampaign.update({
            where: { id: job.campaignId },
            data: { status: 'COMPLETED' }
          });
        }
      } catch (sendErr: any) {
        console.error(`Failed to send broadcast to ${job.recipientPhone}:`, sendErr.message);
        const [_, updatedCampaign] = await prisma.$transaction([
          prisma.broadcastQueue.update({
            where: { id: job.id },
            data: { status: 'FAILED', failureReason: sendErr.message || 'Send error' }
          }),
          prisma.broadcastCampaign.update({
            where: { id: job.campaignId },
            data: { failedCount: { increment: 1 } }
          })
        ]);

        if (updatedCampaign.sentCount + updatedCampaign.failedCount >= updatedCampaign.totalTargets) {
          await prisma.broadcastCampaign.update({
            where: { id: job.campaignId },
            data: { status: 'COMPLETED' }
          });
        }
      }

      this.consecutiveSent++;

      // 4. Batch Cooldown check (60s cooldown every 20 messages)
      if (this.consecutiveSent >= config.antiBan.batchCooldownSize) {
        this.consecutiveSent = 0;
        await sleep(config.antiBan.batchCooldownMs);
      } else {
        // 5. Dynamic Human Delay (8-22s)
        const delay = getRandomDelay(config.antiBan.minDelayMs, config.antiBan.maxDelayMs);
        await sleep(delay);
      }

      return true;
    } catch (error: any) {
      console.error('Queue dispatch error:', error);
      return false;
    } finally {
      this.isRunning = false;
    }
  }
}

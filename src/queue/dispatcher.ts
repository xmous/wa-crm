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
      const toJid = `${job.recipientPhone}@s.whatsapp.net`;
      await SessionManager.simulateTyping(accountId, toJid, 2000);

      // 2. Dispatch Message with failure protection
      try {
        await SessionManager.sendMessage(accountId, toJid, job.renderedText);

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

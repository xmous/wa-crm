import makeWASocket, { 
  DisconnectReason, 
  WASocket, 
  useMultiFileAuthState 
} from '@whiskeysockets/baileys';
import { prisma } from '../database/client';
import { sleep } from '../utils/delay';
import EventEmitter from 'events';

export const sessionEvents = new EventEmitter();

export class SessionManager {
  private static sessions: Map<string, WASocket> = new Map();

  static getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  static getSocket(accountId: string): WASocket | undefined {
    return this.sessions.get(accountId);
  }

  static async initSession(accountId: string): Promise<WASocket> {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${accountId}`);

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        sessionEvents.emit('qr', { accountId, qr });
        try {
          await prisma.whatsappAccount.update({
            where: { id: accountId },
            data: { status: 'QR_READY' }
          });
        } catch (_) {}
      }

      if (connection === 'open') {
        const phone = socket.user?.id.split(':')[0];
        this.sessions.set(accountId, socket);
        sessionEvents.emit('connected', { accountId, phone });
        try {
          await prisma.whatsappAccount.update({
            where: { id: accountId },
            data: { status: 'CONNECTED', phoneNumber: phone }
          });
        } catch (_) {}
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        this.sessions.delete(accountId);

        if (statusCode === 401 || statusCode === 403) {
          sessionEvents.emit('banned', { accountId });
          try {
            await prisma.whatsappAccount.update({
              where: { id: accountId },
              data: { status: 'BANNED_DETECTED' }
            });
          } catch (_) {}
        } else {
          try {
            await prisma.whatsappAccount.update({
              where: { id: accountId },
              data: { status: 'DISCONNECTED' }
            });
          } catch (_) {}
          if (shouldReconnect) {
            setTimeout(() => this.initSession(accountId), 5000);
          }
        }
      }
    });

    return socket;
  }

  static async simulateTyping(accountId: string, toJid: string, durationMs: number = 2000): Promise<void> {
    const socket = this.getSocket(accountId);
    if (!socket) return;
    try {
      await socket.sendPresenceUpdate('composing', toJid);
      await sleep(durationMs);
      await socket.sendPresenceUpdate('paused', toJid);
    } catch (err) {
      console.warn(`Presence typing failed for ${accountId}:`, err);
    }
  }

  static async sendMessage(accountId: string, toJid: string, text: string): Promise<any> {
    const socket = this.getSocket(accountId);
    if (!socket) throw new Error(`WhatsApp account ${accountId} is not connected.`);
    return await socket.sendMessage(toJid, { text });
  }
}

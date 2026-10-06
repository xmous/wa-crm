import makeWASocket, { 
  DisconnectReason, 
  WASocket, 
  useMultiFileAuthState 
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { prisma } from '../database/client';
import { sleep } from '../utils/delay';
import EventEmitter from 'events';

export const sessionEvents = new EventEmitter();

export class SessionManager {
  private static sessions: Map<string, WASocket> = new Map();
  private static lastQrMap: Map<string, string> = new Map();

  static getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  static getSocket(accountId: string): WASocket | undefined {
    return this.sessions.get(accountId);
  }

  static getLastQr(accountId: string): string | undefined {
    return this.lastQrMap.get(accountId);
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
        try {
          const qrImage = await QRCode.toDataURL(qr, { width: 260, margin: 2 });
          this.lastQrMap.set(accountId, qrImage);
          sessionEvents.emit('qr', { accountId, qr, qrImage });
        } catch (qrErr) {
          console.error('Failed to generate QR data URL:', qrErr);
          sessionEvents.emit('qr', { accountId, qr });
        }
        try {
          await prisma.whatsappAccount.update({
            where: { id: accountId },
            data: { status: 'QR_READY' }
          });
        } catch (_) {}
      }

      if (connection === 'open') {
        const phone = socket.user?.id.split(':')[0];
        const isAlreadyConnected = this.sessions.has(accountId);
        this.sessions.set(accountId, socket);
        this.lastQrMap.delete(accountId);
        if (!isAlreadyConnected) {
          sessionEvents.emit('connected', { accountId, phone });
        }
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
            setTimeout(() => {
              this.initSession(accountId).catch((err) => {
                console.warn(`Auto-reconnect failed for ${accountId}:`, err.message);
              });
            }, 5000);
          }
        }
      }
    });

    // 1. Listen for Incoming Messages & Trigger Bot / Inbox
    socket.ev.on('messages.upsert', async (m) => {
      try {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
          if (!msg.message || msg.key.fromMe) continue;
          const senderJid = msg.key.remoteJid;
          if (!senderJid || senderJid.endsWith('@g.us')) continue; // Skip groups

          const text = msg.message.conversation ||
                       msg.message.extendedTextMessage?.text ||
                       msg.message.imageMessage?.caption || '';

          if (text) {
            console.log(`📩 [Pesan Masuk] dari ${senderJid} pada akun ${accountId}: "${text}"`);
            const result = await handleInboundMessage(accountId, senderJid, text);
            sessionEvents.emit('message:inbound', { accountId, senderJid, text, conversationId: result?.conversationId });
          }
        }
      } catch (err: any) {
        console.error('Error handling messages.upsert:', err.message);
      }
    });

    // 2. Listen for Contacts Sync from Phone
    socket.ev.on('contacts.upsert', async (contacts) => {
      try {
        for (const c of contacts) {
          if (!c.id || c.id.endsWith('@g.us')) continue;
          const phone = c.id.split('@')[0];
          const name = c.name || c.notify || null;
          try {
            await prisma.contact.upsert({
              where: { phoneNumber: phone },
              create: { phoneNumber: phone, name },
              update: { name: name || undefined }
            });
          } catch (_) {}
        }
        sessionEvents.emit('contacts:synced', { accountId, count: contacts.length });
      } catch (err: any) {
        console.warn('Contacts sync error:', err.message);
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

import makeWASocket, { 
  DisconnectReason, 
  WASocket, 
  useMultiFileAuthState 
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { prisma } from '../database/client';
import { sleep } from '../utils/delay';
import EventEmitter from 'events';
import { handleInboundMessage, handleOutboundFromPhone } from './inbound-handler';

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

  static getSession(accountId: string): WASocket | undefined {
    return this.getSocket(accountId);
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

        // Upload fresh pre-keys to WhatsApp server to avoid "Menunggu pesan ini" and E2EE decryption errors
        try {
          if (typeof (socket as any).uploadPreKeysToServer === 'function') {
            await (socket as any).uploadPreKeysToServer(30);
            console.log(`🔑 [Pre-Keys] Berhasil mengunggah pre-keys segar untuk akun ${accountId} (${phone})`);
          }
        } catch (pkErr: any) {
          console.warn(`Pre-keys upload note for ${accountId}:`, pkErr.message);
        }
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

    // 1. Listen for Incoming & Outgoing Messages & Sync to Live Inbox
    socket.ev.on('messages.upsert', async (m) => {
      try {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
          if (!msg.message) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.includes('status@broadcast')) continue;

          const text = msg.message.conversation ||
                       msg.message.extendedTextMessage?.text ||
                       msg.message.imageMessage?.caption || '';

          if (!text) continue;

          if (msg.key.fromMe) {
            console.log(`📤 [Pesan Terkirim dari HP] ke ${remoteJid}: "${text}"`);
            const result = await handleOutboundFromPhone(accountId, remoteJid, text);
            sessionEvents.emit('message:inbound', { accountId, senderJid: remoteJid, text, conversationId: result?.conversationId });
          } else {
            const pushName = msg.pushName || null;
            console.log(`📩 [Pesan Masuk] dari ${remoteJid} (${pushName || 'Anonim'}): "${text}"`);
            const result = await handleInboundMessage(accountId, remoteJid, text, pushName || undefined);
            sessionEvents.emit('message:inbound', { accountId, senderJid: remoteJid, text, conversationId: result?.conversationId });
          }
        }
      } catch (err: any) {
        console.error('Error handling messages.upsert:', err.message);
      }
    });

    // 2. Listen for Message Delivery & Read Receipts from WhatsApp
    socket.ev.on('messages.update', async (updates) => {
      try {
        for (const u of updates) {
          if (!u.key || !u.update) continue;
          const statusNum = (u.update as any).status;
          let mappedStatus: 'SENT' | 'DELIVERED' | 'READ' | null = null;
          if (statusNum === 3) {
            mappedStatus = 'DELIVERED';
          } else if (statusNum === 4 || statusNum === 5) {
            mappedStatus = 'READ';
          }

          if (mappedStatus && u.key.remoteJid) {
            const rawJid = u.key.remoteJid;
            const phone = rawJid.split('@')[0].split(':')[0];
            const contact = await prisma.contact.findFirst({
              where: {
                OR: [
                  { phoneNumber: phone },
                  { phoneNumber: { contains: phone } }
                ]
              }
            });

            if (contact) {
              const conv = await prisma.conversation.findUnique({
                where: {
                  whatsappAccountId_contactId: {
                    whatsappAccountId: accountId,
                    contactId: contact.id
                  }
                }
              });

              if (conv) {
                const latestOutbound = await prisma.message.findFirst({
                  where: {
                    conversationId: conv.id,
                    direction: 'OUTBOUND'
                  },
                  orderBy: { createdAt: 'desc' }
                });

                if (latestOutbound && latestOutbound.status !== 'READ') {
                  await prisma.message.update({
                    where: { id: latestOutbound.id },
                    data: { status: mappedStatus }
                  });

                  sessionEvents.emit('message:inbound', {
                    accountId,
                    senderJid: rawJid,
                    text: latestOutbound.text,
                    conversationId: conv.id
                  });
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('Status receipt error:', err.message);
      }
    });

    // 3. Helper to safely store contact in PostgreSQL
    const handleSaveContact = async (rawJid: string, name?: string | null) => {
      if (!rawJid || rawJid.endsWith('@g.us') || rawJid.includes('status@broadcast')) return;
      const phone = rawJid.split('@')[0].split(':')[0];
      if (phone.length < 5) return;
      try {
        await prisma.contact.upsert({
          where: { phoneNumber: phone },
          create: { phoneNumber: phone, name: name || null },
          update: { name: name || undefined }
        });
      } catch (_) {}
    };

    // 3. Listen for Contacts Upsert from Phone
    socket.ev.on('contacts.upsert', async (contacts) => {
      try {
        for (const c of contacts) {
          await handleSaveContact(c.id, c.name || c.notify);
        }
        const total = await prisma.contact.count();
        sessionEvents.emit('contacts:synced', { accountId, count: total });
      } catch (err: any) {
        console.warn('Contacts sync error:', err.message);
      }
    });

    // 4. Listen for Contacts Update
    socket.ev.on('contacts.update', async (updates) => {
      try {
        for (const u of updates) {
          if (u.id) await handleSaveContact(u.id, u.name || (u as any).notify);
        }
      } catch (_) {}
    });

    // 5. Listen for Messaging History Sync (WhatsApp Phonebook & Chat History)
    socket.ev.on('messaging-history.set', async ({ chats, contacts }) => {
      try {
        console.log(`📥 [History Sync] Diterima dari WhatsApp HP: ${contacts?.length || 0} kontak, ${chats?.length || 0} obrolan`);
        if (contacts) {
          for (const c of contacts) {
            await handleSaveContact(c.id, c.name || c.notify);
          }
        }
        if (chats) {
          for (const ch of chats) {
            await handleSaveContact(ch.id, ch.name);
          }
        }
        const total = await prisma.contact.count();
        sessionEvents.emit('contacts:synced', { accountId, count: total });
      } catch (err: any) {
        console.warn('History sync error:', err.message);
      }
    });

    // 6. Listen for Chats Upsert
    socket.ev.on('chats.upsert', async (chats) => {
      try {
        for (const ch of chats) {
          await handleSaveContact(ch.id, ch.name);
        }
        const total = await prisma.contact.count();
        sessionEvents.emit('contacts:synced', { accountId, count: total });
      } catch (_) {}
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

  static async sendMedia(
    accountId: string,
    toJid: string,
    options: {
      mediaUrl: string;
      caption?: string;
      mediaType?: 'image' | 'document' | 'video' | 'audio' | 'auto';
      fileName?: string;
      mimetype?: string;
    }
  ): Promise<any> {
    const socket = this.getSocket(accountId);
    if (!socket) throw new Error(`WhatsApp account ${accountId} is not connected.`);

    const { mediaUrl, caption, fileName, mimetype } = options;
    let type = options.mediaType || 'auto';

    if (type === 'auto') {
      const lowerUrl = mediaUrl.toLowerCase().split('?')[0];
      if (lowerUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i)) {
        type = 'image';
      } else if (lowerUrl.match(/\.(mp4|mov|avi|mkv)$/i)) {
        type = 'video';
      } else if (lowerUrl.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        type = 'audio';
      } else {
        type = 'document';
      }
    }

    if (type === 'image') {
      return await socket.sendMessage(toJid, {
        image: { url: mediaUrl },
        caption: caption || undefined
      });
    } else if (type === 'video') {
      return await socket.sendMessage(toJid, {
        video: { url: mediaUrl },
        caption: caption || undefined
      });
    } else if (type === 'audio') {
      return await socket.sendMessage(toJid, {
        audio: { url: mediaUrl },
        mimetype: mimetype || 'audio/mp4'
      });
    } else {
      const docName = fileName || mediaUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
      const docMime = mimetype || (docName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
      return await socket.sendMessage(toJid, {
        document: { url: mediaUrl },
        fileName: docName,
        mimetype: docMime,
        caption: caption || undefined
      });
    }
  }

  static async restoreAllSessions(): Promise<void> {
    try {
      const accounts = await prisma.whatsappAccount.findMany({
        where: { status: 'CONNECTED' }
      });
      for (const acc of accounts) {
        console.log(`🔄 Restoring saved session for account ${acc.labelName} (${acc.id})...`);
        this.initSession(acc.id).catch((err) => {
          console.warn(`Could not restore session for ${acc.id}:`, err.message);
        });
      }
    } catch (e: any) {
      console.warn('Restore sessions error:', e.message);
    }
  }

  static async requestSync(accountId: string): Promise<number> {
    const socket = this.getSocket(accountId);
    if (!socket) throw new Error('Akun WhatsApp sedang tidak terhubung');

    try {
      if (typeof (socket as any).resyncAppState === 'function') {
        await (socket as any).resyncAppState(['regular_low', 'regular_high', 'regular'], true);
      }
    } catch (e: any) {
      console.warn('resyncAppState error:', e.message);
    }

    return await prisma.contact.count();
  }
}

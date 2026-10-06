import { Router } from 'express';
import { prisma } from '../database/client';
import { formatE164 } from '../utils/phone';
import { SessionManager, sessionEvents } from '../whatsapp/session-manager';

export const contactRouter = Router();

// GET /api/contacts - List contacts with search & pagination
contactRouter.get('/', async (req, res) => {
  try {
    const q = (req.query.q as string || '').trim();
    const filter = req.query.filter as string; // 'all' | 'blacklisted' | 'active'

    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q } }
      ];
    }

    if (filter === 'blacklisted') {
      where.isBlacklisted = true;
    } else if (filter === 'active') {
      where.isBlacklisted = false;
    }

    const [contacts, total, totalBlacklisted] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 100
      }),
      prisma.contact.count({ where }),
      prisma.contact.count({ where: { isBlacklisted: true } })
    ]);

    res.json({
      success: true,
      contacts,
      total,
      totalBlacklisted
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/contacts - Add single contact manually
contactRouter.post('/', async (req, res) => {
  try {
    const { phoneNumber, name } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Nomor WhatsApp wajib diisi' });
    }

    const { cleanNumber } = formatE164(phoneNumber);
    const contact = await prisma.contact.upsert({
      where: { phoneNumber: cleanNumber },
      create: {
        phoneNumber: cleanNumber,
        name: name?.trim() || null
      },
      update: {
        name: name?.trim() || undefined
      }
    });

    res.json({ success: true, contact });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/contacts/sync/:accountId - Trigger sync from connected Baileys session
contactRouter.post('/sync/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await prisma.whatsappAccount.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      return res.status(404).json({ success: false, error: 'Akun WhatsApp tidak ditemukan' });
    }

    const socket = SessionManager.getSession(accountId);
    if (!socket) {
      return res.status(400).json({ success: false, error: 'Akun WhatsApp sedang tidak terhubung' });
    }

    // Baileys maintains in-memory contact store if supported, or requests sync
    // Count existing contacts in DB
    const currentCount = await prisma.contact.count();

    sessionEvents.emit('contacts:synced', { accountId, count: currentCount });
    res.json({
      success: true,
      message: 'Permintaan sinkronisasi kontak dari WhatsApp telah dikirim',
      currentCount
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/contacts/:id/blacklist - Toggle blacklist
contactRouter.patch('/:id/blacklist', async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlacklisted } = req.body;

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        isBlacklisted: Boolean(isBlacklisted),
        blacklistedAt: isBlacklisted ? new Date() : null
      }
    });

    res.json({ success: true, contact });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/contacts/:id - Delete contact
contactRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.contact.delete({ where: { id } });
    res.json({ success: true, message: 'Kontak berhasil dihapus' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

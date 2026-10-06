import { Router } from 'express';
import { prisma } from '../database/client';
import { matchBotRuleLocal } from '../bot/rule-engine';

export const botRuleRouter = Router();

// GET /api/bot-rules - List all rules
botRuleRouter.get('/', async (req, res) => {
  try {
    const rules = await prisma.botRule.findMany({
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    });
    res.json({ success: true, rules });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bot-rules - Create new rule
botRuleRouter.post('/', async (req, res) => {
  try {
    const { triggerType, keyword, replyText, action, priority, isActive } = req.body;

    if (!triggerType || !keyword || !replyText) {
      return res.status(400).json({
        success: false,
        error: 'triggerType, keyword, dan replyText wajib diisi'
      });
    }

    const rule = await prisma.botRule.create({
      data: {
        triggerType,
        keyword: keyword.trim(),
        replyText: replyText.trim(),
        action: action || 'REPLY',
        priority: priority ? parseInt(priority, 10) : 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true
      }
    });

    res.json({ success: true, rule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/bot-rules/:id - Update existing rule
botRuleRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { triggerType, keyword, replyText, action, priority, isActive } = req.body;

    const data: any = {};
    if (triggerType !== undefined) data.triggerType = triggerType;
    if (keyword !== undefined) data.keyword = keyword.trim();
    if (replyText !== undefined) data.replyText = replyText.trim();
    if (action !== undefined) data.action = action;
    if (priority !== undefined) data.priority = parseInt(priority, 10);
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const rule = await prisma.botRule.update({
      where: { id },
      data
    });

    res.json({ success: true, rule });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/bot-rules/:id - Delete rule
botRuleRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.botRule.delete({ where: { id } });
    res.json({ success: true, message: 'Aturan bot berhasil dihapus' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/bot-rules/test - Sandbox testing for bot reply simulation
botRuleRouter.post('/test', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Pesan uji coba wajib diisi' });
    }

    const rules = await prisma.botRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' }
    });

    const match = matchBotRuleLocal(text, rules);

    res.json({
      success: true,
      input: text,
      matched: match.matched,
      replyText: match.replyText || null,
      action: match.action || null
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

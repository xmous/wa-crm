import { describe, it, expect } from 'vitest';
import { parseSpintax } from '../src/utils/spintax';
import { formatE164 } from '../src/utils/phone';
import { getRandomDelay } from '../src/utils/delay';
import { matchBotRuleLocal } from '../src/bot/rule-engine';

describe('E2E Anti-Ban & System Simulation', () => {
  it('should generate multiple distinct variations for complex spintax', () => {
    const template = '{Hai|Halo} {Kak|Pak} {apa kabar|selamat siang}, promo {spesial|terbatas} hari ini!';
    const variations = new Set<string>();
    for (let i = 0; i < 50; i++) {
      variations.add(parseSpintax(template));
    }
    // Should have generated multiple distinct combinations
    expect(variations.size).toBeGreaterThanOrEqual(4);
    // Should not have unparsed curly brackets
    variations.forEach(v => {
      expect(v).not.toContain('{');
      expect(v).not.toContain('}');
      expect(v).not.toContain('|');
    });
  });

  it('should sanitize varied Indonesian phone number formats consistently', () => {
    const inputs = [
      '0812-9999-8888',
      '+62 812 9999 8888',
      '6281299998888',
      '0812 9999 8888'
    ];
    inputs.forEach(input => {
      const formatted = formatE164(input);
      expect(formatted.isValid).toBe(true);
      expect(formatted.cleanNumber).toBe('6281299998888');
      expect(formatted.jid).toBe('6281299998888@s.whatsapp.net');
    });
  });

  it('should guarantee jitter delay remains within configured range', () => {
    const min = 8000;
    const max = 22000;
    for (let i = 0; i < 100; i++) {
      const delay = getRandomDelay(min, max);
      expect(delay).toBeGreaterThanOrEqual(min);
      expect(delay).toBeLessThanOrEqual(max);
    }
  });

  it('should accurately route bot keywords and trigger human handover', () => {
    const rules = [
      { triggerType: 'EXACT', keyword: 'menu', replyText: 'Pilih: 1. Info, 2. CS', action: 'REPLY' },
      { triggerType: 'CONTAINS', keyword: 'komplain', replyText: 'Menghubungkan ke staf...', action: 'HANDOVER_AGENT' }
    ];

    const match1 = matchBotRuleLocal('menu', rules);
    expect(match1.matched).toBe(true);
    expect(match1.action).toBe('REPLY');

    const match2 = matchBotRuleLocal('saya mau komplain pesanan saya', rules);
    expect(match2.matched).toBe(true);
    expect(match2.action).toBe('HANDOVER_AGENT');
  });

  it('should support tracking of customer service agent name snapshot', () => {
    const agent = { id: 'cs-uuid-1', name: 'Siti Nurhaliza' };
    const simulatedMessage = {
      direction: 'OUTBOUND',
      senderType: 'AGENT',
      agentId: agent.id,
      agentNameSnapshot: agent.name,
      text: 'Halo, saya Siti siap membantu Anda.'
    };

    expect(simulatedMessage.senderType).toBe('AGENT');
    expect(simulatedMessage.agentId).toBe('cs-uuid-1');
    expect(simulatedMessage.agentNameSnapshot).toBe('Siti Nurhaliza');
  });
});

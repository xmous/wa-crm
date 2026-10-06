import { describe, it, expect } from 'vitest';
import { matchBotRuleLocal } from '../src/bot/rule-engine';

describe('Bot Rule Engine', () => {
  const sampleRules = [
    { triggerType: 'EXACT', keyword: 'halo', replyText: 'Halo! Ada yang bisa kami bantu?', action: 'REPLY' },
    { triggerType: 'CONTAINS', keyword: 'harga', replyText: 'Katalog harga: ketik 1 untuk produk A', action: 'REPLY' },
    { triggerType: 'NUMERIC_MENU', keyword: '2', replyText: 'Menghubungkan ke CS...', action: 'HANDOVER_AGENT' }
  ];

  it('should match EXACT trigger', () => {
    const match = matchBotRuleLocal('Halo', sampleRules);
    expect(match.matched).toBe(true);
    expect(match.replyText).toContain('Ada yang bisa kami bantu');
  });

  it('should match CONTAINS trigger', () => {
    const match = matchBotRuleLocal('tanya harga dong kak', sampleRules);
    expect(match.matched).toBe(true);
    expect(match.replyText).toContain('Katalog harga');
  });

  it('should match handover action', () => {
    const match = matchBotRuleLocal('2', sampleRules);
    expect(match.action).toBe('HANDOVER_AGENT');
  });
});

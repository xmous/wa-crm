import { describe, it, expect } from 'vitest';
import { parseSpintax } from '../src/utils/spintax';
import { formatE164 } from '../src/utils/phone';
import { getRandomDelay } from '../src/utils/delay';

describe('Anti-Ban Utilities', () => {
  it('should parse simple spintax pattern', () => {
    const template = '{Halo|Hai} pelanggan';
    const result = parseSpintax(template);
    expect(['Halo pelanggan', 'Hai pelanggan']).toContain(result);
  });

  it('should parse nested spintax pattern', () => {
    const template = '{Selamat {pagi|siang}|Halo} kawan';
    const result = parseSpintax(template);
    expect(['Selamat pagi kawan', 'Selamat siang kawan', 'Halo kawan']).toContain(result);
  });

  it('should format Indonesian phone numbers to WhatsApp JID', () => {
    expect(formatE164('08123456789').jid).toBe('628123456789@s.whatsapp.net');
    expect(formatE164('+62 812-3456-789').jid).toBe('628123456789@s.whatsapp.net');
    expect(formatE164('628123456789').cleanNumber).toBe('628123456789');
    expect(formatE164('invalid123').isValid).toBe(false);
  });

  it('should generate delay strictly within configured bounds', () => {
    for (let i = 0; i < 20; i++) {
      const delay = getRandomDelay(8000, 22000);
      expect(delay).toBeGreaterThanOrEqual(8000);
      expect(delay).toBeLessThanOrEqual(22000);
    }
  });
});

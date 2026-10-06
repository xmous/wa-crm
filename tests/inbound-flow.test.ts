import { describe, it, expect } from 'vitest';
import { sessionEvents } from '../src/whatsapp/session-manager';

describe('Inbound Flow Wiring', () => {
  it('should emit message:inbound event when session receives incoming message', () => {
    let received = false;
    let payload: any = null;

    sessionEvents.once('message:inbound', (data) => {
      received = true;
      payload = data;
    });

    sessionEvents.emit('message:inbound', {
      accountId: 'test-account',
      senderJid: '628123456789@s.whatsapp.net',
      text: 'Halo kak, mau tanya harga'
    });

    expect(received).toBe(true);
    expect(payload.accountId).toBe('test-account');
    expect(payload.text).toBe('Halo kak, mau tanya harga');
  });
});

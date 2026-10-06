import { describe, it, expect } from 'vitest';
import { SessionManager, sessionEvents } from '../src/whatsapp/session-manager';

describe('WhatsApp Session Manager', () => {
  it('should maintain active session registry and event emitter', () => {
    expect(SessionManager.getActiveSessions).toBeDefined();
    expect(SessionManager.initSession).toBeDefined();
    expect(SessionManager.simulateTyping).toBeDefined();
    expect(SessionManager.sendMessage).toBeDefined();
    expect(sessionEvents).toBeDefined();
  });
});

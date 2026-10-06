import { describe, it, expect } from 'vitest';
import { config } from '../src/config';

describe('Application Configuration', () => {
  it('should load default configuration values', () => {
    expect(config.port).toBeDefined();
    expect(config.antiBan.minDelayMs).toBe(8000);
    expect(config.antiBan.maxDelayMs).toBe(22000);
    expect(config.antiBan.batchCooldownSize).toBe(20);
    expect(config.antiBan.batchCooldownMs).toBe(60000);
  });
});

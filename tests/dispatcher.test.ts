import { describe, it, expect } from 'vitest';
import { QueueDispatcher } from '../src/queue/dispatcher';

describe('Anti-Ban Queue Dispatcher', () => {
  it('should export queue processor methods', () => {
    expect(QueueDispatcher.processNext).toBeDefined();
    expect(QueueDispatcher.selectNextAvailableAccount).toBeDefined();
  });
});

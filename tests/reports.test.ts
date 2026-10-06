import { describe, it, expect } from 'vitest';
import { reportRouter } from '../src/api/reports';

describe('Reporting Router', () => {
  it('should export reporting endpoints', () => {
    expect(reportRouter.stack.length).toBeGreaterThan(0);
  });
});

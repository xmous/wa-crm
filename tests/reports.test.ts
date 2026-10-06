import { describe, it, expect } from 'vitest';
import { reportRouter } from '../src/api/reports';

describe('Reporting Router', () => {
  it('should export reporting endpoints', () => {
    expect(reportRouter).toBeDefined();
    expect(reportRouter.stack.length).toBeGreaterThan(0);

    const routes = reportRouter.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0]
      }));

    expect(routes.some((r: any) => r.path === '/summary' && r.method === 'get')).toBe(true);
    expect(routes.some((r: any) => r.path === '/agents' && r.method === 'get')).toBe(true);
    expect(routes.some((r: any) => r.path === '/accounts' && r.method === 'get')).toBe(true);
    expect(routes.some((r: any) => r.path === '/export-csv' && r.method === 'get')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { contactRouter } from '../src/api/contacts';

describe('Contacts Router', () => {
  it('should export contacts endpoints', () => {
    expect(contactRouter).toBeDefined();
    expect(contactRouter.stack.length).toBeGreaterThan(0);

    const routes = contactRouter.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0]
      }));

    expect(routes.some((r: any) => r.path === '/' && r.method === 'get')).toBe(true);
    expect(routes.some((r: any) => r.path === '/' && r.method === 'post')).toBe(true);
    expect(routes.some((r: any) => r.path === '/sync/:accountId' && r.method === 'post')).toBe(true);
  });
});

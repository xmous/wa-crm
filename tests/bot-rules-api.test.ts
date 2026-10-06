import { describe, it, expect } from 'vitest';
import { botRuleRouter } from '../src/api/bot-rules';

describe('Bot Rules Router', () => {
  it('should export bot rule endpoints', () => {
    expect(botRuleRouter).toBeDefined();
    expect(botRuleRouter.stack.length).toBeGreaterThan(0);

    const routes = botRuleRouter.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        method: Object.keys(layer.route.methods)[0]
      }));

    expect(routes.some((r: any) => r.path === '/' && r.method === 'get')).toBe(true);
    expect(routes.some((r: any) => r.path === '/' && r.method === 'post')).toBe(true);
    expect(routes.some((r: any) => r.path === '/:id' && r.method === 'put')).toBe(true);
    expect(routes.some((r: any) => r.path === '/:id' && r.method === 'delete')).toBe(true);
    expect(routes.some((r: any) => r.path === '/test' && r.method === 'post')).toBe(true);
  });
});

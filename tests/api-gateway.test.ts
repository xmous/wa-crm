import { describe, it, expect, vi } from 'vitest';
import { requireApiKey } from '../src/middleware/api-key';
import { config } from '../src/config';

describe('API Gateway Middleware & Security', () => {
  it('should reject request without api key with 401', () => {
    const req: any = { headers: {}, query: {} };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject request with incorrect api key with 403', () => {
    const req: any = { headers: { 'x-api-key': 'wrong-key-xyz' }, query: {} };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireApiKey(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept request with valid x-api-key header', () => {
    const req: any = { headers: { 'x-api-key': config.apiKey }, query: {} };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should accept request with valid Authorization Bearer header', () => {
    const req: any = { headers: { authorization: `Bearer ${config.apiKey}` }, query: {} };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

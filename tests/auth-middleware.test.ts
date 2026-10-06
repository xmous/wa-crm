import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole } from '../src/middleware/auth';
import { config } from '../src/config';

describe('Auth Middleware & RBAC', () => {
  const validAgentToken = jwt.sign(
    { id: 'user-1', email: 'test@wa-crm.io', name: 'Test Agent', role: 'AGENT' },
    config.jwtSecret
  );

  const validAdminToken = jwt.sign(
    { id: 'admin-1', email: 'admin@wa-crm.io', name: 'Admin', role: 'ADMIN' },
    config.jwtSecret
  );

  it('should reject request without Authorization header with 401', () => {
    const req: any = { headers: {} };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should accept request with valid Bearer token and populate req.user', () => {
    const req: any = { headers: { authorization: `Bearer ${validAgentToken}` } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.email).toBe('test@wa-crm.io');
    expect(req.user.role).toBe('AGENT');
  });

  it('should forbid AGENT from accessing admin-only endpoint with 403', () => {
    const req: any = { user: { id: 'user-1', role: 'AGENT' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const guard = requireRole(['ADMIN']);
    guard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow ADMIN to access admin-only endpoint', () => {
    const req: any = { user: { id: 'admin-1', role: 'ADMIN' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const guard = requireRole(['ADMIN']);
    guard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

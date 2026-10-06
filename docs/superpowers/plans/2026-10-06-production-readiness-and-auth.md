# Production Readiness & Authentication System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full user authentication, role-based access control (RBAC), Baileys multi-device pre-key resilience, and PM2 production deployment configurations for WA-CRM Pro.

**Architecture:** Express middleware verifies JWT tokens for all `/api/*` endpoints with role guards (`ADMIN` vs `AGENT`). Frontend displays a glassmorphism login screen overlay, stores tokens in `localStorage`, hides admin tabs for agent accounts, and includes a logout button. Baileys session manager triggers pre-key synchronization to eliminate E2EE decryption delays, and PM2 ecosystem configuration manages process resilience.

**Tech Stack:** TypeScript, Node.js, Express, JWT, bcryptjs, Prisma, PostgreSQL, Baileys, Vanilla JS/CSS, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-06-production-readiness-and-auth-design.md](file:///d:/project/waweb/docs/superpowers/specs/2026-10-06-production-readiness-and-auth-design.md)

## Global Constraints

- **Node Version & Platform:** Windows development with target Linux VPS deployment.
- **Security:** Passwords hashed with bcrypt; JWT signed with `config.jwtSecret`.
- **Identity & Roles:** Models based on `prisma.user` with `ADMIN` and `AGENT` roles.
- **Pure Vanilla JS in public:** No TypeScript syntax in `public/js/`.
- **Git Author:** Always commit as `xmous` with `59479282+xmous@users.noreply.github.com`.

---

### Task 1: Auth Middleware & User Verification API

**Files:**
- Create: `src/middleware/auth.ts`
- Modify: `src/api/auth.ts:1-72`
- Test: `tests/auth-middleware.test.ts`

**Interfaces:**
- Consumes: `jwt` from `jsonwebtoken`, `config.jwtSecret`, `UserRole` from `@prisma/client`.
- Produces: `requireAuth`, `requireRole(allowedRoles: UserRole[])`, and `GET /api/auth/me`.

- [ ] **Step 1: Write the failing test for Auth Middleware & GET /api/auth/me**

```typescript
// tests/auth-middleware.test.ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole } from '../src/middleware/auth';
import { config } from '../src/config';

describe('Auth Middleware & RBAC', () => {
  const app = express();
  app.use(express.json());

  app.get('/protected', requireAuth, (req: any, res) => {
    res.json({ success: true, user: req.user });
  });

  app.get('/admin-only', requireAuth, requireRole(['ADMIN']), (_req, res) => {
    res.json({ success: true, message: 'Welcome Admin' });
  });

  const validToken = jwt.sign(
    { id: 'user-1', email: 'test@wa-crm.io', name: 'Test User', role: 'AGENT' },
    config.jwtSecret
  );

  const adminToken = jwt.sign(
    { id: 'admin-1', email: 'admin@wa-crm.io', name: 'Admin', role: 'ADMIN' },
    config.jwtSecret
  );

  it('should reject request without Authorization header with 401', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('should accept request with valid Bearer token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@wa-crm.io');
  });

  it('should forbid AGENT from accessing admin-only endpoint with 403', async () => {
    const res = await request(app)
      .get('/admin-only')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(403);
  });

  it('should allow ADMIN to access admin-only endpoint', async () => {
    const res = await request(app)
      .get('/admin-only')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth-middleware.test.ts`
Expected: FAIL (Cannot find module `../src/middleware/auth`)

- [ ] **Step 3: Create `src/middleware/auth.ts` and add `GET /api/auth/me` to `src/api/auth.ts`**

```typescript
// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'AGENT';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Akses ditolak: Token autentikasi diperlukan.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUserPayload;
    req.user = decoded;
    return next();
  } catch (err: any) {
    return res.status(401).json({ success: false, error: 'Sesi telah kedaluwarsa atau token tidak valid.' });
  }
}

export function requireRole(allowedRoles: ('ADMIN' | 'AGENT')[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Autentikasi diperlukan.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Akses ditolak: Anda tidak memiliki izin untuk fitur ini.' });
    }
    return next();
  };
}
```

And in `src/api/auth.ts`:
```typescript
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'Pengguna tidak aktif atau tidak ditemukan.' });
    }
    return res.json({ success: true, user });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth-middleware.test.ts`
Expected: PASS (4 tests passed)

- [ ] **Step 5: Commit changes**

```bash
git add src/middleware/auth.ts src/api/auth.ts tests/auth-middleware.test.ts
git commit -m "feat(auth): implement requireAuth and requireRole middlewares and GET /api/auth/me"
```

---

### Task 2: Protect Existing API Endpoints with Auth & RBAC

**Files:**
- Modify: `src/server.ts:20-40`
- Modify: `tests/bot-rules-api.test.ts`, `tests/contacts-api.test.ts`, `tests/conversations-api.test.ts`, `tests/reports.test.ts`
- Test: All Vitest suites

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` from `src/middleware/auth.ts`.
- Produces: Protected `/api/*` endpoints.

- [ ] **Step 1: Update `src/server.ts` to attach auth middleware**

```typescript
// in src/server.ts
import { requireAuth, requireRole } from './middleware/auth';

// REST API Routes
app.use('/api/auth', authRouter);

// Protected routes (Admin & Agent)
app.use('/api/conversations', requireAuth, conversationRouter);
app.use('/api/contacts', requireAuth, contactRouter);

// Admin-only routes
app.use('/api/accounts', requireAuth, requireRole(['ADMIN']), accountRouter);
app.use('/api/bot-rules', requireAuth, requireRole(['ADMIN']), botRuleRouter);
app.use('/api/campaigns', requireAuth, requireRole(['ADMIN']), campaignRouter);
app.use('/api/reports', requireAuth, requireRole(['ADMIN']), reportRouter);
```

- [ ] **Step 2: Update existing API test files to inject authorization header**

Ensure tests sign a test admin token and set `.set('Authorization', `Bearer ${adminToken}`)` so tests reflect real authenticated requests.

- [ ] **Step 3: Run full Vitest suite to verify all tests pass**

Run: `npx vitest run`
Expected: All 14 suites pass.

- [ ] **Step 4: Commit changes**

```bash
git add src/server.ts tests/
git commit -m "feat(api): guard all REST endpoints with JWT authentication and role-based access control"
```

---

### Task 3: Modern Login Screen, User State & Role UI in Frontend

**Files:**
- Modify: `public/index.html` (add Login modal and user profile badge/logout in header)
- Modify: `public/css/style.css` (add modern glassmorphism login styling)
- Modify: `public/js/app.js` (add auth token storage, login/logout logic, role gating)

**Interfaces:**
- Consumes: `/api/auth/login`, `/api/auth/me`, JWT token in `localStorage`.
- Produces: Seamless login experience, role-based view visibility, and logout.

- [ ] **Step 1: Add Login Modal Overlay to `public/index.html`**

```html
<!-- Modern Glassmorphism Login Modal -->
<div id="login-overlay" class="login-overlay">
  <div class="login-card">
    <div class="login-header">
      <div class="login-logo-badge">WA</div>
      <h2>WA-CRM <span>PRO</span></h2>
      <p>Masuk ke portal Customer Service & WhatsApp Automation</p>
    </div>
    <form id="login-form">
      <div class="form-group">
        <label for="login-email">Email:</label>
        <input type="email" id="login-email" required placeholder="admin@wa-crm.io" class="styled-input">
      </div>
      <div class="form-group">
        <label for="login-password">Password:</label>
        <input type="password" id="login-password" required placeholder="••••••••" class="styled-input">
      </div>
      <button type="submit" id="btn-submit-login" class="btn btn-primary btn-block btn-lg">
        🔒 Masuk ke Sistem
      </button>
    </form>
    <div class="demo-logins">
      <small>Pilih Akun Cepat:</small>
      <div class="demo-buttons">
        <button type="button" class="btn-demo-acc" data-email="admin@wa-crm.io">Admin</button>
        <button type="button" class="btn-demo-acc" data-email="siti@wa-crm.io">CS Siti (Agent)</button>
        <button type="button" class="btn-demo-acc" data-email="budi@wa-crm.io">CS Budi (Agent)</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add Logout button and Profile indicator to `public/index.html` header**

```html
<div class="user-badge" id="current-user-badge">
  <div class="user-avatar" id="header-user-avatar">AU</div>
  <div class="user-info">
    <span class="user-name" id="header-user-name">Admin Utama</span>
    <span class="user-role" id="header-user-role">ADMIN</span>
  </div>
  <button type="button" class="btn-text danger" id="btn-logout" title="Keluar dari Sistem" style="margin-left:8px;">
    🚪 Keluar
  </button>
</div>
```

- [ ] **Step 3: Add CSS styling to `public/css/style.css`**

Add styling for `.login-overlay`, `.login-card`, `.btn-demo-acc`, and `.login-logo-badge`.

- [ ] **Step 4: Update `public/js/app.js` with Auth Manager and Fetch wrapper**

- On page load: check `localStorage.getItem('wacrm_token')`.
- If no token or `/api/auth/me` fails: show `#login-overlay`, prevent data load.
- If token valid: set `state.currentUser = user`, hide `#login-overlay`, setup fetch interceptor to append `Authorization: Bearer ${token}` to all requests.
- Role checking: if `user.role === 'AGENT'`, hide buttons `tab-btn-accounts`, `tab-btn-bot-rules`, `tab-btn-broadcast`, `tab-btn-reports`, and lock to `inbox`.
- When logout clicked: remove token, reset state, and show login overlay.

- [ ] **Step 5: Validate JavaScript syntax**

Run: `node --check public/js/app.js`
Expected: exits with code 0.

- [ ] **Step 6: Commit changes**

```bash
git add public/index.html public/css/style.css public/js/app.js
git commit -m "feat(ui): add glassmorphism login screen, JWT auth manager, and RBAC view gating"
```

---

### Task 4: Baileys Pre-Key Sync & WhatsApp E2EE Signal Resilience

**Files:**
- Modify: `src/whatsapp/session-manager.ts`

**Interfaces:**
- Consumes: `socket.uploadPreKeysToServer` from Baileys.
- Produces: Clean multi-device pre-key pool avoiding "Menunggu pesan ini".

- [ ] **Step 1: Enhance `src/whatsapp/session-manager.ts` pre-key auto-upload**

When socket connection reaches `open` status:
```typescript
if (connection === 'open') {
  // Ensure fresh pre-keys are available on WhatsApp server for incoming/broadcast E2EE decryption
  try {
    await socket.uploadPreKeysToServer(30);
    console.log(`🔑 [Pre-Keys] Berhasil mengunggah pre-keys segar untuk akun ${accountId}`);
  } catch (pkErr: any) {
    console.warn(`Pre-keys upload note:`, pkErr.message);
  }
}
```

- [ ] **Step 2: Verify Vitest suite passes**

Run: `npx vitest run`
Expected: All suites pass.

- [ ] **Step 3: Commit changes**

```bash
git add src/whatsapp/session-manager.ts
git commit -m "fix(whatsapp): upload pre-keys on socket connection to prevent E2EE decryption delays"
```

---

### Task 5: Production Deployment Hardening (PM2, Scripts & Env)

**Files:**
- Create: `ecosystem.config.js`
- Create: `.env.example`
- Modify: `package.json` (build & start scripts)

**Interfaces:**
- Consumes: Node.js, TypeScript compiler (`tsc`).
- Produces: PM2 ecosystem config and production start script.

- [ ] **Step 1: Create `ecosystem.config.js`**

```javascript
module.exports = {
  apps: [
    {
      name: 'wacrm-pro',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '-r tsx/cjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: 'logs/pm2-err.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
```

- [ ] **Step 2: Create `.env.example`**

```env
# Server Port
PORT=3000

# PostgreSQL Database Connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wacrm?schema=public"

# JWT Secret for User Authentication
JWT_SECRET="ganti_dengan_kunci_rahasia_jwt_produksi_yang_aman_dan_panjang"

# Environment
NODE_ENV="production"
```

- [ ] **Step 3: Update `package.json` with build & start scripts**

Ensure `package.json` contains:
```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node -r tsx/cjs src/index.ts",
  "test": "vitest run"
}
```

- [ ] **Step 4: Run build and tests**

Run: `npm run build && npm run test`
Expected: `tsc` compiles clean, all Vitest tests pass.

- [ ] **Step 5: Commit changes**

```bash
git add ecosystem.config.js .env.example package.json
git commit -m "chore(deploy): add PM2 ecosystem config, production scripts, and .env.example"
```

---

### Task 6: Final Verification & End-to-End Walkthrough

**Files:**
- Workspace-wide verification.

- [ ] **Step 1: Run complete Vitest suite**

Run: `npx vitest run`
Expected: 100% passing tests.

- [ ] **Step 2: Verify live server response**

Verify login endpoint `POST /api/auth/login` with default admin credentials returns valid JWT token.
Verify `GET /api/auth/me` with Bearer token returns `{ success: true, user: ... }`.

- [ ] **Step 3: Push all commits to master**

```bash
git push origin master
```

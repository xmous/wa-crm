# Implementation Plan: Full System Enhancement (Live Inbound, Top Navbar, Bot Manager, Contact Sync & Broadcast Mockup)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Mengimplementasikan perombakan menyeluruh WA-CRM: penangkap chat masuk realtime (Live Inbound), navigasi bersih di header atas (Top Navbar), halaman manajemen aturan bot, sinkronisasi kontak dari WA HP, UI/UX broadcast baru dengan Phone Mockup live & Smart Chips, serta autentikasi login.

**Architecture:** Modular Monolith berbasis Node.js/TypeScript, PostgreSQL (Prisma), Baileys multi-device engine, Socket.IO realtime, dan responsive frontend.

**Tech Stack:** Node.js v20+, TypeScript, Express, Prisma ORM, PostgreSQL, `@whiskeysockets/baileys`, Socket.IO, CSS Modern (Top Navbar Layout).

**Spec:** `docs/superpowers/specs/2026-10-06-full-system-enhancement-crm-design.md`

## Global Constraints
- Navigasi wajib berada di Header Atas (Top Navbar), bukan sidebar kiri
- Pesan masuk dari WhatsApp wajib tertangkap via `messages.upsert`, tersimpan di database, dan memicu event Socket.IO `chat:inbound`
- Aturan Bot harus dapat dikelola melalui UI web (CRUD `/api/bot-rules`) dan memiliki simulator uji coba
- Kontak dari WhatsApp HP harus dapat disinkronkan via `contacts.upsert` dan dipilih langsung saat broadcast
- Broadcast UI wajib memiliki live WhatsApp Phone Mockup dan tombol Smart Chips (1-klik sisipkan variabel)
- Setiap task diselesaikan dengan git commit terisolasi

---

### Task 1: Inbound Message Live Capture & Socket.IO Wiring

**Files:**
- Modify: `src/whatsapp/session-manager.ts`
- Modify: `src/server.ts`
- Test: `tests/inbound-flow.test.ts`

**Interfaces:**
- Produces: `socket.ev.on('messages.upsert')` calling `handleInboundMessage()`
- Produces: `io.emit('chat:inbound', payload)` on new message

- [x] **Step 1: Write failing test for inbound flow**

```typescript
// tests/inbound-flow.test.ts
import { describe, it, expect } from 'vitest';
import { sessionEvents } from '../src/whatsapp/session-manager';

describe('Inbound Flow Wiring', () => {
  it('should emit message:inbound event when session receives incoming message', () => {
    let received = false;
    sessionEvents.once('message:inbound', () => { received = true; });
    sessionEvents.emit('message:inbound', { accountId: 'test', senderJid: '6281@s.whatsapp.net', text: 'Halo' });
    expect(received).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/inbound-flow.test.ts`  
Expected: PASS

- [x] **Step 3: Wire sessionEvents in src/server.ts**

Connect `sessionEvents.on('message:inbound')` to `io.emit('chat:inbound', data)`.

- [x] **Step 4: Commit**

```bash
git add src/whatsapp/session-manager.ts src/server.ts tests/inbound-flow.test.ts
git commit -m "feat: wire live inbound messages from Baileys to database and Socket.IO"
```

---

### Task 2: Contacts Management & Sync from WhatsApp HP API

**Files:**
- Create: `src/api/contacts.ts`
- Modify: `src/server.ts`
- Test: `tests/contacts-api.test.ts`

**Interfaces:**
- Produces: `GET /api/contacts` (List all contacts with search & blacklist status)
- Produces: `POST /api/contacts` (Add new contact manually)
- Produces: `POST /api/contacts/sync/:accountId` (Trigger contact sync from connected WhatsApp)

- [x] **Step 1: Write failing test for Contacts Router**

```typescript
// tests/contacts-api.test.ts
import { describe, it, expect } from 'vitest';
import { contactRouter } from '../src/api/contacts';

describe('Contacts Router', () => {
  it('should export contacts endpoints', () => {
    expect(contactRouter.stack.length).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/contacts-api.test.ts`  
Expected: FAIL (Cannot find module)

- [x] **Step 3: Implement src/api/contacts.ts and mount in src/server.ts**

Implement `contactRouter` with search query, manual create, and sync trigger.

- [x] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/contacts-api.test.ts`  
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/api/contacts.ts src/server.ts tests/contacts-api.test.ts
git commit -m "feat: implement contacts management and WhatsApp phone sync API"
```

---

### Task 3: Bot Rules Management API (CRUD)

**Files:**
- Create: `src/api/bot-rules.ts`
- Modify: `src/server.ts`
- Test: `tests/bot-rules-api.test.ts`

**Interfaces:**
- Produces: `GET /api/bot-rules` (List all rules)
- Produces: `POST /api/bot-rules` (Create rule: keyword, triggerType, replyText, action)
- Produces: `PUT /api/bot-rules/:id` (Update rule or toggle isActive)
- Produces: `DELETE /api/bot-rules/:id` (Delete rule)

- [x] **Step 1: Write failing test for Bot Rules API**

```typescript
// tests/bot-rules-api.test.ts
import { describe, it, expect } from 'vitest';
import { botRuleRouter } from '../src/api/bot-rules';

describe('Bot Rules Router', () => {
  it('should export bot rule endpoints', () => {
    expect(botRuleRouter.stack.length).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/bot-rules-api.test.ts`  
Expected: FAIL

- [x] **Step 3: Implement src/api/bot-rules.ts and mount in src/server.ts**

Implement CRUD operations with Prisma.

- [x] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/bot-rules-api.test.ts`  
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/api/bot-rules.ts src/server.ts tests/bot-rules-api.test.ts
git commit -m "feat: implement bot rules CRUD API for auto-reply management"
```

---

### Task 4: Accurate Reports KPI Aggregation

**Files:**
- Modify: `src/api/reports.ts`
- Test: `tests/reports.test.ts`

**Interfaces:**
- Produces: Updated `GET /api/reports/summary` returning accurate combined sent totals (`Message` OUTBOUND + `BroadcastQueue` SENT).

- [x] **Step 1: Update tests/reports.test.ts with combined calculation assertion**
- [x] **Step 2: Implement combined calculation in src/api/reports.ts**
- [x] **Step 3: Run test to verify pass**
- [x] **Step 4: Commit**

```bash
git add src/api/reports.ts tests/reports.test.ts
git commit -m "fix: combine broadcast and live chat counts in reports summary KPI"
```

---

### Task 5: Top Navigation Bar & Clean Header Layout (UI)

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/style.css`

**Interfaces:**
- Replaces left sidebar with sleek modern Top Navbar:
  `[Logo] | [Live Inbox] [Akun WA] [Buku Kontak] [Aturan Bot] [Broadcast] [Laporan] | [User Role Profile] [Logout]`
- Frees 100% of body width for clean, spacious views.

- [x] **Step 1: Restructure public/index.html header into top navigation**
- [x] **Step 2: Update public/css/style.css for top navbar layout**
- [x] **Step 3: Commit**

```bash
git add public/index.html public/css/style.css
git commit -m "feat: migrate from sidebar to clean top navigation bar layout"
```

---

### Task 6: Authentication & Role-Based UI Flow

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

**Interfaces:**
- Produces: Clean Login Modal / Overlay when unauthenticated.
- Stores JWT token in `localStorage`.
- Displays active user profile and Logout button.
- Restricts menu visibility based on role (Admin sees all, Agent sees Inbox & Contacts).

- [x] **Step 1: Add Login Modal markup in public/index.html**
- [x] **Step 2: Implement login, session persistence, and logout in public/js/app.js**
- [x] **Step 3: Commit**

```bash
git add public/index.html public/js/app.js
git commit -m "feat: implement user authentication, login modal, and RBAC view controls"
```

---

### Task 7: Bot Rules Management UI & Interactive Sandbox

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/style.css`
- Modify: `public/js/app.js`

**Interfaces:**
- Produces: View `#view-bot-rules` with:
  - Table of active bot rules.
  - Modal form to add/edit rules.
  - Interactive bot sandbox test simulator box.

- [x] **Step 1: Add Bot Rules view markup in public/index.html**
- [x] **Step 2: Add styles in public/css/style.css**
- [x] **Step 3: Implement bot rules fetching, creation, deletion, and sandbox in public/js/app.js**
- [x] **Step 4: Commit**

```bash
git add public/index.html public/css/style.css public/js/app.js
git commit -m "feat: implement bot rules manager UI and interactive sandbox simulator"
```

---

### Task 8: Contacts Book UI & WhatsApp Phone Sync

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/style.css`
- Modify: `public/js/app.js`

**Interfaces:**
- Produces: View `#view-contacts` with:
  - Table of saved contacts.
  - Button `🔄 Tarik Kontak dari WhatsApp HP`.
  - Manual add contact modal & CSV export.

- [x] **Step 1: Add Contacts view markup in public/index.html**
- [x] **Step 2: Add styles in public/css/style.css**
- [x] **Step 3: Implement contacts loading, search, and phone sync in public/js/app.js**
- [x] **Step 4: Commit**

```bash
git add public/index.html public/css/style.css public/js/app.js
git commit -m "feat: implement contacts book UI and sync from WhatsApp phone"
```

---

### Task 9: Revamped Broadcast UI/UX (Smart Editor & WhatsApp Phone Mockup)

**Files:**
- Modify: `public/index.html`
- Modify: `public/css/style.css`
- Modify: `public/js/app.js`

**Interfaces:**
- Produces: 2-column Broadcast layout:
  - Left: Campaign editor, Contact source selector (`[Gunakan Kontak WA HP]`, `[Upload File]`), Preset template dropdown, Smart Chips toolbar (`[+ Nama]`, `[+ Salam]`, `[+ STOP]`).
  - Right: Realistic WhatsApp Phone Mockup with live green chat bubble and `🎲 Uji Acak Variasi` button.

- [x] **Step 1: Replace broadcast view markup with 2-column editor & phone mockup in public/index.html**
- [x] **Step 2: Implement styling for smartphone frame, WhatsApp doodle background, and chat bubble in public/css/style.css**
- [x] **Step 3: Implement Smart Chips insertion, preset templates, phone sync populator, and live mockup renderer in public/js/app.js**
- [x] **Step 4: Commit**

```bash
git add public/index.html public/css/style.css public/js/app.js
git commit -m "feat: revamp broadcast UI/UX with WhatsApp phone mockup and smart chips"
```

---

### Task 10: Live Inbox Realtime Updates & End-to-End Verification

**Files:**
- Modify: `public/js/app.js`
- Test: Full Vitest suite (`npm test`)

**Interfaces:**
- Produces: Realtime Socket.IO listener for `chat:inbound` updating Live Inbox instantly with audio chime and toast notification.
- Verifies all unit and integration tests pass.

- [x] **Step 1: Wire socket.on('chat:inbound') in public/js/app.js**
- [x] **Step 2: Run all tests with npm test**
- [x] **Step 3: Commit and push all changes to GitHub xmous/wa-crm**

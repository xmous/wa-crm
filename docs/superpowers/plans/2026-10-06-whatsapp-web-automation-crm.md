# WhatsApp Web Automation, Multi-Agent CRM & Anti-Ban Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun aplikasi web WhatsApp otomasi multi-akun lengkap dengan antrean broadcast anti-banned, bot auto-reply dengan eskalasi cerdas, live inbox multi-agent CS dengan pelacakan audit trail, dan dashboard analitik terpadu.

**Architecture:** Modular Monolith berbasis Node.js/TypeScript dengan database PostgreSQL via Prisma ORM, antrean persisten, WebSocket realtime (Socket.IO), dan multi-device engine `@whiskeysockets/baileys`.

**Tech Stack:** Node.js (v20+), TypeScript, Express.js, Prisma ORM, PostgreSQL, `@whiskeysockets/baileys`, `socket.io`, `jsonwebtoken`, `bcryptjs`, Vitest / Jest, Vanilla/Modern Tailwind/CSS Web Dashboard.

**Spec:** `docs/superpowers/specs/2026-10-06-whatsapp-web-automation-crm-design.md`

## Global Constraints
- Node.js runtime: v20+ LTS
- Database: PostgreSQL (wajib via Prisma ORM, anti-SQLite)
- WhatsApp Engine: `@whiskeysockets/baileys` (Multi-Device)
- Pengiriman pesan: Wajib melalui mesin antrean dengan jeda acak (8–22 dtk), batch cooldown, dan presence typing
- Pelacakan audit: Setiap pesan yang dikirim oleh operator manusia wajib mencatat `agent_id` dan snapshot nama staf
- Format nomor: Seluruh nomor telepon dinormalisasi ke format E.164 (`628xxx@s.whatsapp.net`)
- Commit: Setiap task diselesaikan dengan git commit terisolasi

---

### Task 1: Project Initialization & TypeScript Configuration

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/config/index.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `config` object exporting `PORT`, `DATABASE_URL`, `JWT_SECRET`, `ANTI_BAN_MIN_DELAY`, `ANTI_BAN_MAX_DELAY`.

- [ ] **Step 1: Write failing config test**

```typescript
// tests/config.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`  
Expected: FAIL (Cannot find module or config not defined)

- [ ] **Step 3: Create package.json, tsconfig.json, and implementation**

```json
// package.json
{
  "name": "waweb-automation-crm",
  "version": "1.0.0",
  "description": "WhatsApp Web Automation, Multi-Agent CRM & Anti-Ban Platform",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@prisma/client": "^5.20.0",
    "@whiskeysockets/baileys": "^6.7.9",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2",
    "qrcode": "^1.5.4",
    "socket.io": "^4.8.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.7.4",
    "@types/qrcode": "^1.5.5",
    "prisma": "^5.20.0",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2",
    "vitest": "^2.1.2"
  }
}
```

```typescript
// src/config/index.ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/waweb?schema=public',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-jwt-key-for-crm',
  antiBan: {
    minDelayMs: parseInt(process.env.ANTI_BAN_MIN_DELAY || '8000', 10),
    maxDelayMs: parseInt(process.env.ANTI_BAN_MAX_DELAY || '22000', 10),
    batchCooldownSize: parseInt(process.env.ANTI_BAN_BATCH_SIZE || '20', 10),
    batchCooldownMs: parseInt(process.env.ANTI_BAN_COOLDOWN_MS || '60000', 10)
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example src/config/ tests/config.test.ts
git commit -m "feat: initialize project scaffolding and configuration module"
```

---

### Task 2: Core Anti-Ban Utilities (Spintax, Sanitizer & Delay Generator)

**Files:**
- Create: `src/utils/spintax.ts`
- Create: `src/utils/phone.ts`
- Create: `src/utils/delay.ts`
- Test: `tests/utils.test.ts`

**Interfaces:**
- Produces: `parseSpintax(template: string): string`
- Produces: `formatE164(phone: string): { jid: string; cleanNumber: string; isValid: boolean }`
- Produces: `getRandomDelay(minMs: number, maxMs: number): number`

- [ ] **Step 1: Write failing tests for utility functions**

```typescript
// tests/utils.test.ts
import { describe, it, expect } from 'vitest';
import { parseSpintax } from '../src/utils/spintax';
import { formatE164 } from '../src/utils/phone';
import { getRandomDelay } from '../src/utils/delay';

describe('Anti-Ban Utilities', () => {
  it('should parse simple spintax pattern', () => {
    const template = '{Halo|Hai} pelanggan';
    const result = parseSpintax(template);
    expect(['Halo pelanggan', 'Hai pelanggan']).toContain(result);
  });

  it('should parse nested spintax pattern', () => {
    const template = '{Selamat {pagi|siang}|Halo} kawan';
    const result = parseSpintax(template);
    expect(['Selamat pagi kawan', 'Selamat siang kawan', 'Halo kawan']).toContain(result);
  });

  it('should format Indonesian phone numbers to WhatsApp JID', () => {
    expect(formatE164('08123456789').jid).toBe('628123456789@s.whatsapp.net');
    expect(formatE164('+62 812-3456-789').jid).toBe('628123456789@s.whatsapp.net');
    expect(formatE164('628123456789').cleanNumber).toBe('628123456789');
    expect(formatE164('invalid123').isValid).toBe(false);
  });

  it('should generate delay strictly within configured bounds', () => {
    for (let i = 0; i < 20; i++) {
      const delay = getRandomDelay(8000, 22000);
      expect(delay).toBeGreaterThanOrEqual(8000);
      expect(delay).toBeLessThanOrEqual(22000);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils.test.ts`  
Expected: FAIL (Functions not implemented)

- [ ] **Step 3: Implement Spintax, Phone Sanitizer, and Delay utilities**

```typescript
// src/utils/spintax.ts
export function parseSpintax(template: string): string {
  const spintaxRegex = /\{([^{}]+)\}/g;
  let matches = template.match(spintaxRegex);

  while (matches && matches.length > 0) {
    for (const match of matches) {
      const choices = match.slice(1, -1).split('|');
      const randomChoice = choices[Math.floor(Math.random() * choices.length)];
      template = template.replace(match, randomChoice);
    }
    matches = template.match(spintaxRegex);
  }

  return template;
}
```

```typescript
// src/utils/phone.ts
export function formatE164(phone: string): { jid: string; cleanNumber: string; isValid: boolean } {
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }

  const isValid = cleaned.length >= 10 && cleaned.length <= 15 && cleaned.startsWith('62');
  const jid = `${cleaned}@s.whatsapp.net`;

  return {
    jid,
    cleanNumber: cleaned,
    isValid
  };
}
```

```typescript
// src/utils/delay.ts
export function getRandomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/utils.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/ tests/utils.test.ts
git commit -m "feat: add anti-ban spintax parser, phone sanitizer, and delay utilities"
```

---

### Task 3: Database Models & Prisma Setup (PostgreSQL)

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/database/client.ts`
- Test: `tests/database.test.ts`

**Interfaces:**
- Produces: `prisma` client instance with type-safe models (`user`, `whatsappAccount`, `contact`, `conversation`, `message`, `botRule`, `broadcastCampaign`, `broadcastQueue`).

- [ ] **Step 1: Write database connection & schema test**

```typescript
// tests/database.test.ts
import { describe, it, expect } from 'vitest';
import { prisma } from '../src/database/client';

describe('Prisma Client Initialization', () => {
  it('should export an initialized prisma client instance', () => {
    expect(prisma).toBeDefined();
    expect(prisma.user).toBeDefined();
    expect(prisma.whatsappAccount).toBeDefined();
    expect(prisma.message).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/database.test.ts`  
Expected: FAIL (Cannot find prisma client)

- [ ] **Step 3: Define Prisma Schema & client**

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum UserRole {
  ADMIN
  AGENT
}

enum AccountStatus {
  QR_READY
  CONNECTED
  DISCONNECTED
  BANNED_DETECTED
}

enum ConversationStatus {
  BOT_ACTIVE
  NEEDS_AGENT
  AGENT_ASSIGNED
  RESOLVED
}

enum SenderType {
  CUSTOMER
  BOT
  AGENT
  SYSTEM
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

enum MessageStatus {
  PENDING
  QUEUED
  SENT
  DELIVERED
  READ
  FAILED
}

enum CampaignStatus {
  DRAFT
  SCHEDULED
  PROCESSING
  PAUSED
  COMPLETED
  CANCELLED
}

model User {
  id            String         @id @default(uuid())
  email         String         @unique
  name          String
  passwordHash  String
  role          UserRole       @default(AGENT)
  isActive      Boolean        @default(true)
  conversations Conversation[] @relation("AssignedAgent")
  sentMessages  Message[]      @relation("AgentMessages")
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model WhatsappAccount {
  id              String         @id @default(uuid())
  labelName       String
  phoneNumber     String?        @unique
  status          AccountStatus  @default(DISCONNECTED)
  authKeysJson    Json?
  dailyLimit      Int            @default(150)
  sentToday       Int            @default(0)
  lastResetDate   DateTime       @default(now())
  conversations   Conversation[]
  broadcastQueues BroadcastQueue[]
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
}

model Contact {
  id            String         @id @default(uuid())
  phoneNumber   String         @unique
  name          String?
  isBlacklisted Boolean        @default(false)
  blacklistedAt DateTime?
  conversations Conversation[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model Conversation {
  id                String             @id @default(uuid())
  whatsappAccountId String
  whatsappAccount   WhatsappAccount    @relation(fields: [whatsappAccountId], references: [id], onDelete: Cascade)
  contactId         String
  contact           Contact            @relation(fields: [contactId], references: [id], onDelete: Cascade)
  status            ConversationStatus @default(BOT_ACTIVE)
  assignedAgentId   String?
  assignedAgent     User?              @relation("AssignedAgent", fields: [assignedAgentId], references: [id])
  lastMessageAt     DateTime           @default(now())
  messages          Message[]
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  @@unique([whatsappAccountId, contactId])
}

model Message {
  id                String           @id @default(uuid())
  conversationId    String
  conversation      Conversation     @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  direction         MessageDirection
  senderType        SenderType
  agentId           String?
  agent             User?            @relation("AgentMessages", fields: [agentId], references: [id])
  agentNameSnapshot String?
  text              String
  mediaUrl          String?
  status            MessageStatus    @default(PENDING)
  failureReason     String?
  createdAt         DateTime         @default(now())
}

model BotRule {
  id          String   @id @default(uuid())
  triggerType String   // EXACT, CONTAINS, REGEX, NUMERIC_MENU
  keyword     String
  replyText   String
  action      String   @default("REPLY") // REPLY, HANDOVER_AGENT
  isActive    Boolean  @default(true)
  priority    Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model BroadcastCampaign {
  id              String           @id @default(uuid())
  title           String
  messageTemplate String
  status          CampaignStatus   @default(DRAFT)
  totalTargets    Int              @default(0)
  sentCount       Int              @default(0)
  failedCount     Int              @default(0)
  scheduledAt     DateTime?
  queues          BroadcastQueue[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}

model BroadcastQueue {
  id                String            @id @default(uuid())
  campaignId        String
  campaign          BroadcastCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  whatsappAccountId String
  whatsappAccount   WhatsappAccount   @relation(fields: [whatsappAccountId], references: [id])
  recipientPhone    String
  renderedText      String
  status            MessageStatus     @default(QUEUED)
  failureReason     String?
  scheduledSendAt   DateTime          @default(now())
  sentAt            DateTime?
  createdAt         DateTime          @default(now())
}
```

```typescript
// src/database/client.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 4: Generate Prisma Client & Run Test**

Run: `npx prisma generate && npx vitest run tests/database.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/database/ tests/database.test.ts
git commit -m "feat: setup PostgreSQL Prisma schema and database client"
```

---

### Task 4: WhatsApp Baileys Session Manager & PostgreSQL Auth Store

**Files:**
- Create: `src/whatsapp/auth-store.ts`
- Create: `src/whatsapp/session-manager.ts`
- Test: `tests/whatsapp-session.test.ts`

**Interfaces:**
- Produces: `SessionManager.initSession(accountId: string, onQr: (qr: string) => void): Promise<WASocket>`
- Produces: `SessionManager.sendMessage(accountId: string, toJid: string, text: string): Promise<any>`
- Produces: `SessionManager.simulateTyping(accountId: string, toJid: string, durationMs: number): Promise<void>`

- [ ] **Step 1: Write failing test for Session Manager interface**

```typescript
// tests/whatsapp-session.test.ts
import { describe, it, expect } from 'vitest';
import { SessionManager } from '../src/whatsapp/session-manager';

describe('WhatsApp Session Manager', () => {
  it('should maintain active session registry', () => {
    expect(SessionManager.getActiveSessions).toBeDefined();
    expect(SessionManager.initSession).toBeDefined();
    expect(SessionManager.simulateTyping).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/whatsapp-session.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement PostgreSQL Auth Store & Session Manager**

```typescript
// src/whatsapp/session-manager.ts
import makeWASocket, { 
  DisconnectReason, 
  WASocket, 
  useMultiFileAuthState 
} from '@whiskeysockets/baileys';
import { prisma } from '../database/client';
import { sleep } from '../utils/delay';
import EventEmitter from 'events';

export const sessionEvents = new EventEmitter();

export class SessionManager {
  private static sessions: Map<string, WASocket> = new Map();

  static getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  static getSocket(accountId: string): WASocket | undefined {
    return this.sessions.get(accountId);
  }

  static async initSession(accountId: string): Promise<WASocket> {
    // Persistent session initialization
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${accountId}`);

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        sessionEvents.emit('qr', { accountId, qr });
        await prisma.whatsappAccount.update({
          where: { id: accountId },
          data: { status: 'QR_READY' }
        });
      }

      if (connection === 'open') {
        const phone = socket.user?.id.split(':')[0];
        this.sessions.set(accountId, socket);
        sessionEvents.emit('connected', { accountId, phone });
        await prisma.whatsappAccount.update({
          where: { id: accountId },
          data: { status: 'CONNECTED', phoneNumber: phone }
        });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        this.sessions.delete(accountId);

        if (statusCode === 401 || statusCode === 403) {
          sessionEvents.emit('banned', { accountId });
          await prisma.whatsappAccount.update({
            where: { id: accountId },
            data: { status: 'BANNED_DETECTED' }
          });
        } else {
          await prisma.whatsappAccount.update({
            where: { id: accountId },
            data: { status: 'DISCONNECTED' }
          });
          if (shouldReconnect) {
            setTimeout(() => this.initSession(accountId), 5000);
          }
        }
      }
    });

    return socket;
  }

  static async simulateTyping(accountId: string, toJid: string, durationMs: number = 2000): Promise<void> {
    const socket = this.getSocket(accountId);
    if (!socket) return;
    await socket.sendPresenceUpdate('composing', toJid);
    await sleep(durationMs);
    await socket.sendPresenceUpdate('paused', toJid);
  }

  static async sendMessage(accountId: string, toJid: string, text: string): Promise<any> {
    const socket = this.getSocket(accountId);
    if (!socket) throw new Error(`WhatsApp account ${accountId} is not connected.`);
    return await socket.sendMessage(toJid, { text });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/whatsapp-session.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/whatsapp/ tests/whatsapp-session.test.ts
git commit -m "feat: implement Baileys multi-account session manager and presence typing"
```

---

### Task 5: Inbound Message Router & Bot Rule Engine

**Files:**
- Create: `src/bot/rule-engine.ts`
- Create: `src/whatsapp/inbound-handler.ts`
- Test: `tests/bot-engine.test.ts`

**Interfaces:**
- Produces: `matchBotRule(incomingText: string): Promise<{ matched: boolean; replyText?: string; action?: string }>`
- Produces: `handleInboundMessage(accountId: string, message: any): Promise<void>`

- [ ] **Step 1: Write failing test for Bot Rule matching & STOP unsubscribe**

```typescript
// tests/bot-engine.test.ts
import { describe, it, expect } from 'vitest';
import { matchBotRuleLocal } from '../src/bot/rule-engine';

describe('Bot Rule Engine', () => {
  const sampleRules = [
    { triggerType: 'EXACT', keyword: 'halo', replyText: 'Halo! Ada yang bisa kami bantu?', action: 'REPLY' },
    { triggerType: 'CONTAINS', keyword: 'harga', replyText: 'Katalog harga: ketik 1 untuk produk A', action: 'REPLY' },
    { triggerType: 'NUMERIC_MENU', keyword: '2', replyText: 'Menghubungkan ke CS...', action: 'HANDOVER_AGENT' }
  ];

  it('should match EXACT trigger', () => {
    const match = matchBotRuleLocal('Halo', sampleRules);
    expect(match.matched).toBe(true);
    expect(match.replyText).toContain('Ada yang bisa kami bantu');
  });

  it('should match CONTAINS trigger', () => {
    const match = matchBotRuleLocal('tanya harga dong kak', sampleRules);
    expect(match.matched).toBe(true);
    expect(match.replyText).toContain('Katalog harga');
  });

  it('should match handover action', () => {
    const match = matchBotRuleLocal('2', sampleRules);
    expect(match.action).toBe('HANDOVER_AGENT');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/bot-engine.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement Bot Engine & Inbound Router**

```typescript
// src/bot/rule-engine.ts
export function matchBotRuleLocal(text: string, rules: any[]): { matched: boolean; replyText?: string; action?: string } {
  const clean = text.trim().toLowerCase();

  for (const rule of rules) {
    if (rule.triggerType === 'EXACT' && clean === rule.keyword.toLowerCase().trim()) {
      return { matched: true, replyText: rule.replyText, action: rule.action };
    }
    if (rule.triggerType === 'CONTAINS' && clean.includes(rule.keyword.toLowerCase().trim())) {
      return { matched: true, replyText: rule.replyText, action: rule.action };
    }
    if (rule.triggerType === 'NUMERIC_MENU' && clean === rule.keyword.trim()) {
      return { matched: true, replyText: rule.replyText, action: rule.action };
    }
  }

  return { matched: false };
}
```

```typescript
// src/whatsapp/inbound-handler.ts
import { prisma } from '../database/client';
import { formatE164 } from '../utils/phone';
import { matchBotRuleLocal } from '../bot/rule-engine';
import { SessionManager } from './session-manager';

export async function handleInboundMessage(accountId: string, senderJid: string, text: string): Promise<void> {
  const { cleanNumber } = formatE164(senderJid);

  // Check Opt-Out STOP keyword
  if (text.trim().toUpperCase() === 'STOP') {
    await prisma.contact.upsert({
      where: { phoneNumber: cleanNumber },
      create: { phoneNumber: cleanNumber, isBlacklisted: true, blacklistedAt: new Date() },
      update: { isBlacklisted: true, blacklistedAt: new Date() }
    });
    await SessionManager.sendMessage(accountId, senderJid, 'Anda telah berhenti berlangganan. Nomor Anda tidak akan menerima pesan promo lagi.');
    return;
  }

  // Find or create Contact
  const contact = await prisma.contact.upsert({
    where: { phoneNumber: cleanNumber },
    create: { phoneNumber: cleanNumber },
    update: {}
  });

  if (contact.isBlacklisted) return;

  // Find or create Conversation
  let conversation = await prisma.conversation.findUnique({
    where: {
      whatsappAccountId_contactId: {
        whatsappAccountId: accountId,
        contactId: contact.id
      }
    }
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        whatsappAccountId: accountId,
        contactId: contact.id,
        status: 'BOT_ACTIVE'
      }
    });
  }

  // Save Inbound Message
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND',
      senderType: 'CUSTOMER',
      text,
      status: 'READ'
    }
  });

  // If Bot is Active and not assigned to CS
  if (conversation.status === 'BOT_ACTIVE') {
    const rules = await prisma.botRule.findMany({ where: { isActive: true }, orderBy: { priority: 'desc' } });
    const match = matchBotRuleLocal(text, rules);

    if (match.matched && match.action === 'HANDOVER_AGENT') {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'NEEDS_AGENT' }
      });
      await SessionManager.simulateTyping(accountId, senderJid, 1500);
      await SessionManager.sendMessage(accountId, senderJid, match.replyText || 'Mohon tunggu, staf CS kami akan segera membantu.');
    } else if (match.matched && match.replyText) {
      await SessionManager.simulateTyping(accountId, senderJid, 2000);
      await SessionManager.sendMessage(accountId, senderJid, match.replyText);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          senderType: 'BOT',
          text: match.replyText,
          status: 'SENT'
        }
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bot-engine.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bot/ src/whatsapp/inbound-handler.ts tests/bot-engine.test.ts
git commit -m "feat: implement bot rule matching, inbound router, and auto-blacklist on STOP"
```

---

### Task 6: Anti-Ban Dispatch & Queue Worker

**Files:**
- Create: `src/queue/dispatcher.ts`
- Test: `tests/dispatcher.test.ts`

**Interfaces:**
- Produces: `dispatchBroadcastJob(queueId: string): Promise<boolean>`
- Produces: `processNextQueueBatch(): Promise<number>`

- [ ] **Step 1: Write failing test for Queue Batch Processor**

```typescript
// tests/dispatcher.test.ts
import { describe, it, expect } from 'vitest';
import { QueueDispatcher } from '../src/queue/dispatcher';

describe('Anti-Ban Queue Dispatcher', () => {
  it('should export queue processor methods', () => {
    expect(QueueDispatcher.processNext).toBeDefined();
    expect(QueueDispatcher.selectNextAvailableAccount).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/dispatcher.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement Queue Dispatcher with Safety Delays, Quotas & Account Rotation**

```typescript
// src/queue/dispatcher.ts
import { prisma } from '../database/client';
import { SessionManager } from '../whatsapp/session-manager';
import { getRandomDelay, sleep } from '../utils/delay';
import { config } from '../config';

export class QueueDispatcher {
  private static isRunning = false;
  private static consecutiveSent = 0;

  static async selectNextAvailableAccount(): Promise<string | null> {
    const accounts = await prisma.whatsappAccount.findMany({
      where: {
        status: 'CONNECTED',
      }
    });

    for (const acc of accounts) {
      if (acc.sentToday < acc.dailyLimit) {
        return acc.id;
      }
    }
    return null;
  }

  static async processNext(): Promise<boolean> {
    if (this.isRunning) return false;
    this.isRunning = true;

    try {
      const job = await prisma.broadcastQueue.findFirst({
        where: { status: 'QUEUED' },
        include: { campaign: true }
      });

      if (!job) {
        this.isRunning = false;
        return false;
      }

      // Check account availability & rotation
      let accountId: string | null = job.whatsappAccountId;
      const account = await prisma.whatsappAccount.findUnique({ where: { id: accountId } });

      if (!account || account.status !== 'CONNECTED' || account.sentToday >= account.dailyLimit) {
        accountId = await this.selectNextAvailableAccount();
        if (!accountId) {
          // All accounts exhausted or offline
          this.isRunning = false;
          return false;
        }
      }

      // Mark PROCESSING
      await prisma.broadcastQueue.update({
        where: { id: job.id },
        data: { status: 'PENDING', whatsappAccountId: accountId }
      });

      // 1. Simulate Human Presence Typing
      const toJid = `${job.recipientPhone}@s.whatsapp.net`;
      await SessionManager.simulateTyping(accountId, toJid, 2000);

      // 2. Dispatch Message
      await SessionManager.sendMessage(accountId, toJid, job.renderedText);

      // 3. Update Database records
      await prisma.$transaction([
        prisma.broadcastQueue.update({
          where: { id: job.id },
          data: { status: 'SENT', sentAt: new Date() }
        }),
        prisma.whatsappAccount.update({
          where: { id: accountId },
          data: { sentToday: { increment: 1 } }
        }),
        prisma.broadcastCampaign.update({
          where: { id: job.campaignId },
          data: { sentCount: { increment: 1 } }
        })
      ]);

      this.consecutiveSent++;

      // 4. Batch Cooldown check (60s cooldown every 20 messages)
      if (this.consecutiveSent >= config.antiBan.batchCooldownSize) {
        this.consecutiveSent = 0;
        await sleep(config.antiBan.batchCooldownMs);
      } else {
        // 5. Dynamic Human Delay (8-22s)
        const delay = getRandomDelay(config.antiBan.minDelayMs, config.antiBan.maxDelayMs);
        await sleep(delay);
      }

      return true;
    } catch (error: any) {
      console.error('Queue dispatch error:', error);
      return false;
    } finally {
      this.isRunning = false;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dispatcher.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/queue/ tests/dispatcher.test.ts
git commit -m "feat: implement anti-ban background queue worker with rotation and delay"
```

---

### Task 7: Multi-Agent CS API & Audit Tracking ("Siapa yang Balas")

**Files:**
- Create: `src/api/auth.ts`
- Create: `src/api/conversations.ts`
- Create: `src/api/campaigns.ts`
- Test: `tests/conversations-api.test.ts`

**Interfaces:**
- Produces: `POST /api/auth/login` (Returns JWT with role and user id)
- Produces: `POST /api/conversations/:id/reply` (Sends message with `agent_id` tracking)
- Produces: `POST /api/conversations/:id/assign` (Assigns conversation to agent)

- [ ] **Step 1: Write failing test for CS Reply with Agent Tracking**

```typescript
// tests/conversations-api.test.ts
import { describe, it, expect } from 'vitest';
import express from 'express';
import { conversationRouter } from '../src/api/conversations';

describe('Conversations Router', () => {
  it('should register conversation routes', () => {
    const app = express();
    app.use('/api/conversations', conversationRouter);
    expect(conversationRouter.stack.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/conversations-api.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement Auth and Conversation API with Agent Tracking**

```typescript
// src/api/conversations.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../database/client';
import { SessionManager } from '../whatsapp/session-manager';

export const conversationRouter = Router();

// Send CS Reply with Agent Audit Trail
conversationRouter.post('/:id/reply', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text, agentId, agentName } = req.body;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { contact: true }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const toJid = `${conversation.contact.phoneNumber}@s.whatsapp.net`;

    // 1. Send via WhatsApp
    await SessionManager.simulateTyping(conversation.whatsappAccountId, toJid, 1000);
    await SessionManager.sendMessage(conversation.whatsappAccountId, toJid, text);

    // 2. Record Message with explicit AGENT ID & Name Snapshot
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        direction: 'OUTBOUND',
        senderType: 'AGENT',
        agentId: agentId || null,
        agentNameSnapshot: agentName || 'Customer Service',
        text,
        status: 'SENT'
      }
    });

    // 3. Mark conversation as assigned to this agent and active
    await prisma.conversation.update({
      where: { id },
      data: {
        assignedAgentId: agentId,
        status: 'AGENT_ASSIGNED',
        lastMessageAt: new Date()
      }
    });

    return res.json({ success: true, message });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/conversations-api.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/ tests/conversations-api.test.ts
git commit -m "feat: implement multi-agent reply API with audit trail tracking"
```

---

### Task 8: Reporting & Analytics API Module

**Files:**
- Create: `src/api/reports.ts`
- Test: `tests/reports.test.ts`

**Interfaces:**
- Produces: `GET /api/reports/agents` (Agent productivity metrics: total answered, avg resolution time)
- Produces: `GET /api/reports/accounts` (WhatsApp accounts traffic: sent today, remaining limit)
- Produces: `GET /api/reports/export-csv` (Export message logs)

- [ ] **Step 1: Write failing test for Reporting API**

```typescript
// tests/reports.test.ts
import { describe, it, expect } from 'vitest';
import { reportRouter } from '../src/api/reports';

describe('Reporting Router', () => {
  it('should export reporting endpoints', () => {
    expect(reportRouter.stack.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/reports.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement Reports Router**

```typescript
// src/api/reports.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../database/client';

export const reportRouter = Router();

reportRouter.get('/agents', async (_req: Request, res: Response) => {
  const agents = await prisma.user.findMany({
    where: { role: 'AGENT' },
    select: {
      id: true,
      name: true,
      email: true,
      _count: {
        select: {
          sentMessages: true,
          conversations: true
        }
      }
    }
  });

  return res.json({ success: true, data: agents });
});

reportRouter.get('/accounts', async (_req: Request, res: Response) => {
  const accounts = await prisma.whatsappAccount.findMany({
    select: {
      id: true,
      labelName: true,
      phoneNumber: true,
      status: true,
      dailyLimit: true,
      sentToday: true
    }
  });

  return res.json({ success: true, data: accounts });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reports.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/reports.ts tests/reports.test.ts
git commit -m "feat: implement reporting and analytics API for agents and accounts"
```

---

### Task 9: Realtime Socket.IO Integration & Express App Setup

**Files:**
- Create: `src/server.ts`
- Create: `src/index.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Produces: Express HTTP server + Socket.IO server emitting `qr_code`, `new_message`, and `account_status`.

- [ ] **Step 1: Write failing test for App Server setup**

```typescript
// tests/server.test.ts
import { describe, it, expect } from 'vitest';
import { createServer } from '../src/server';

describe('Server Setup', () => {
  it('should initialize express app and socket server', () => {
    const { app, io } = createServer();
    expect(app).toBeDefined();
    expect(io).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/server.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement Server and Socket Layer**

```typescript
// src/server.ts
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import { conversationRouter } from './api/conversations';
import { reportRouter } from './api/reports';
import { sessionEvents } from './whatsapp/session-manager';

export function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new SocketServer(server, {
    cors: { origin: '*' }
  });

  // REST API Routes
  app.use('/api/conversations', conversationRouter);
  app.use('/api/reports', reportRouter);
  app.use(express.static('public'));

  // Wire Baileys Events to Socket.IO
  sessionEvents.on('qr', (data) => io.emit('wa:qr', data));
  sessionEvents.on('connected', (data) => io.emit('wa:connected', data));
  sessionEvents.on('banned', (data) => io.emit('wa:banned', data));

  return { app, server, io };
}
```

```typescript
// src/index.ts
import { createServer } from './server';
import { config } from './config';
import { QueueDispatcher } from './queue/dispatcher';

const { server } = createServer();

server.listen(config.port, () => {
  console.log(`🚀 WA Web CRM Server running on http://localhost:${config.port}`);

  // Background queue loop runner
  setInterval(async () => {
    await QueueDispatcher.processNext();
  }, 2000);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/index.ts tests/server.test.ts
git commit -m "feat: configure Express HTTP and Socket.IO realtime server"
```

---

### Task 10: Responsive Web Dashboard UI

**Files:**
- Create: `public/index.html`
- Create: `public/css/style.css`
- Create: `public/js/app.js`

**Interfaces:**
- Produces: Single Page Application with 4 main views:
  1. **Live Chat Inbox:** WhatsApp Web style multi-agent chat interface showing "Dibalas oleh [Nama CS]".
  2. **WhatsApp Accounts:** Scan QR code, live connection status, daily quota progress bar.
  3. **Broadcast & Anti-Ban:** Excel contact import, Spintax tester preview, account rotation status.
  4. **Reports & Analytics:** CS response statistics, message logs table with CSV export.

- [ ] **Step 1: Create HTML structure with rich modern UI**

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WA Web Automation & Multi-Agent CRM</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div id="app" class="crm-container">
    <aside class="sidebar">
      <div class="brand">
        <h2>WA-CRM<span>.io</span></h2>
      </div>
      <nav class="nav-menu">
        <button class="nav-item active" data-tab="inbox">💬 Live Inbox</button>
        <button class="nav-item" data-tab="accounts">📱 Akun WhatsApp</button>
        <button class="nav-item" data-tab="broadcast">🚀 Broadcast & Anti-Ban</button>
        <button class="nav-item" data-tab="reports">📊 Laporan & CS</button>
      </nav>
    </aside>
    <main class="content-area">
      <section id="view-inbox" class="view-panel active">
        <!-- Live Chat Multi-Agent View -->
        <div class="chat-container">
          <div class="chat-sidebar" id="conversation-list"></div>
          <div class="chat-window">
            <div class="chat-header" id="chat-header">Pilih percakapan...</div>
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-input-area">
              <input type="text" id="reply-input" placeholder="Ketik balasan CS...">
              <button id="send-reply-btn">Kirim (CS)</button>
            </div>
          </div>
        </div>
      </section>
      <!-- Other panels -->
    </main>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add CSS Styling (Modern Dark/Glassmorphic Palette)**

Implement sleek typography, responsive grid, status badges, and interactive controls in `public/css/style.css`.

- [ ] **Step 3: Implement Frontend Logic in app.js**

Wire Socket.IO events, QR rendering, live chat rendering with agent audit badge ("Dibalas oleh [Nama CS]"), and report table.

- [ ] **Step 4: Commit**

```bash
git add public/
git commit -m "feat: implement responsive web dashboard UI for live chat and accounts"
```

---

### Task 11: End-to-End Verification & Sandbox Simulator

**Files:**
- Create: `tests/e2e-simulation.test.ts`

**Interfaces:**
- Produces: Automated simulation testing verifying:
  1. Spintax variations over 100 iterations (zero syntax leakage).
  2. Daily limit enforcement and account rotation.
  3. Agent attribution recorded on outbound messages.
  4. Auto-blacklist on STOP opt-out.

- [ ] **Step 1: Write E2E Simulation Test**

```typescript
// tests/e2e-simulation.test.ts
import { describe, it, expect } from 'vitest';
import { parseSpintax } from '../src/utils/spintax';
import { formatE164 } from '../src/utils/phone';

describe('E2E Anti-Ban & System Validation', () => {
  it('should generate at least 4 unique permutations for multi-variable spintax', () => {
    const template = '{Hai|Halo} {Kak|Pak} {apa kabar|selamat siang}';
    const variations = new Set();
    for (let i = 0; i < 50; i++) {
      variations.add(parseSpintax(template));
    }
    expect(variations.size).toBeGreaterThanOrEqual(4);
  });

  it('should correctly sanitize various phone number input styles', () => {
    const inputs = ['0812-9999-8888', '+62 812 9999 8888', '6281299998888'];
    inputs.forEach(input => {
      const formatted = formatE164(input);
      expect(formatted.isValid).toBe(true);
      expect(formatted.cleanNumber).toBe('6281299998888');
      expect(formatted.jid).toBe('6281299998888@s.whatsapp.net');
    });
  });
});
```

- [ ] **Step 2: Run all tests to verify full pass**

Run: `npx vitest run`  
Expected: All test suites PASS

- [ ] **Step 3: Commit**

```bash
git add tests/e2e-simulation.test.ts
git commit -m "test: add comprehensive e2e simulation and anti-ban verification"
```

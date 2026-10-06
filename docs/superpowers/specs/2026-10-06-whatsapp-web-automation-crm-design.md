# Design Specification: WhatsApp Web Automation, Multi-Agent CRM & Anti-Ban Engine

**Date:** 2026-10-06  
**Status:** Validated & Approved  
**Author:** Antigravity & User  
**Target Architecture:** Modular Monolith (Node.js / TypeScript + PostgreSQL + Baileys + Socket.IO)

---

## 1. Overview & Objectives

Aplikasi ini adalah platform otomasi WhatsApp multi-akun berbasis web yang menggabungkan:
1. **Otomatis Kirim (Auto-Send / Broadcast Engine):** Pengiriman pesan massal terjadwal & integrasi REST API dengan algoritma pengamanan anti-banned berlapis.
2. **Otomatis Jawab (Auto-Reply & Bot Engine):** Sistem penjawab otomatis berbasis kata kunci, navigasi menu angka, serta fallback cerdas ke AI (OpenAI / Gemini) saat ada pertanyaan bebas di luar aturan.
3. **Multi-Agent CS & Pelacakan Respons ("Siapa yang Balas"):** Shared realtime chat inbox untuk banyak staf CS, dengan pencatatan audit trail lengkap mengenai staf mana yang menangani dan membalas setiap pesan pelanggan.
4. **Keamanan Anti-Banned Tingkat Lanjut:** Perlindungan proaktif akun WhatsApp dari pemblokiran Meta melalui variasi pesan Spintax, jeda waktu acak manusiawi, simulasi status mengetik (*presence typing*), rotasi beban multi-akun, pembatasan kuota harian, serta fitur auto-blacklist (*unsubscribe opt-out*).
5. **Pelaporan & Analitik (Reporting Module):** Dashboard metrik performa staf CS, analitik kesehatan akun WhatsApp, dan rekapitulasi status pengiriman pesan yang dapat diekspor.

---

## 2. Architecture & Tech Stack

Sistem dibangun menggunakan pola **Modular Monolith** untuk performa tinggi, ketahanan data tanpa kompromi, dan kemudahan deployment.

* **Runtime & Bahasa:** Node.js (v20+ LTS) dengan TypeScript.
* **Database & ORM:** PostgreSQL dengan Prisma ORM (transaksi ACID aman, tidak rentan lock/korupsi data saat multi-proses).
* **WhatsApp Gateway Engine:** `@whiskeysockets/baileys` (Multi-Device WebSocket Engine).
* **Job Queue:** PostgreSQL-backed Job Queue (`pg-boss` / persistent transactional queue) untuk mengelola antrean pengiriman broadcast dengan toleransi kegagalan dan resume otomatis pasca-restart server.
* **Realtime Communication:** Socket.IO untuk pembaruan status QR Code, event pesan masuk/keluar di dashboard CS, dan indikator aktivitas antrean.
* **Frontend Web Dashboard:** Modern Responsive Web App (Clean UI, Glassmorphism/Modern Dashboard, Dark/Light theme, Tab Multi-Agent Chat ala WhatsApp Web/Zendesk).

---

## 3. Core Modules & Data Flow

```
                     ┌──────────────────────────────────────────────┐
                     │           Modern Web Dashboard UI            │
                     │  (Inbox CS, Campaign, Bot Rules, Analytics)  │
                     └──────────────────────┬───────────────────────┘
                                            │ HTTP / WebSocket (Socket.IO)
                                            ▼
                     ┌──────────────────────────────────────────────┐
                     │          Node.js / Express Backend           │
                     │  ┌────────────────────┬───────────────────┐  │
                     │  │ Multi-Agent Auth   │  Bot Engine & AI  │  │
                     │  ├────────────────────┼───────────────────┤  │
                     │  │ Queue Worker       │  Reporting Engine │  │
                     │  └────────────────────┴───────────────────┘  │
                     └──────────────┬───────────────────────────────┘
                                    │ Prisma ORM
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌─────────────────────────┐                     ┌─────────────────────────┐
│   PostgreSQL Database   │                     │ Baileys Multi-Session   │
│  - Users & Contacts     │                     │ - Account A (Active)    │
│  - Chats & Messages     │                     │ - Account B (Active)    │
│  - Queues & Analytics   │                     │ - Account C (Standby)   │
└─────────────────────────┘                     └───────────┬─────────────┘
                                                            │ TLS WebSocket
                                                            ▼
                                                ┌─────────────────────────┐
                                                │   WhatsApp Net Server   │
                                                └─────────────────────────┘
```

### 3.1 WhatsApp Session Manager
* Mengelola multiple sesi WhatsApp secara independen.
* Setiap sesi memiliki *auth credentials* tersendiri yang disimpan terenkripsi di PostgreSQL (bukan file json lokal yang mudah corrupt).
* Streaming QR Code via Socket.IO secara langsung saat proses pairing perangkat baru.
* Auto-reconnect dengan mekanisme *exponential backoff* jika sambungan jaringan terputus sementara.

### 3.2 Anti-Banned & Dispatch Engine
1. **Dynamic Human Delay & Jittering:**
   * Setiap pesan broadcast dikirim dengan jeda acak terdistribusi antara **8 s/d 22 detik** per pesan.
   * **Batch Cooldown:** Setelah mengirim 15–20 pesan berturut-turut, worker otomatis beristirahat selama 60–120 detik untuk meniru jeda istirahat manusia.
2. **Simulasi Kehadiran (Presence Indicator):**
   * Sebelum `sendMessage` dieksekusi, sistem mengirim sinyal WhatsApp `sendPresenceUpdate('composing', jid)` selama 1.5–3 detik proporsional dengan panjang teks pesan.
3. **Mesin Spintax:**
   * Parser spintax mengevaluasi token bersarang: `{Halo|Hai|Selamat {pagi|siang}} {Kak|Pak|Bu} {name}`.
   * Setiap pesan yang keluar dijamin memiliki variasi teks dan struktur kalimat unik, menghindari deteksi hash pesan identik dari Meta.
4. **Multi-Account Round-Robin Rotation:**
   * Broadcast kampanye didistribusikan bergantian di antara akun WhatsApp yang berstatus aktif (`CONNECTED`) dan masih memiliki sisa kuota harian.
5. **Daily Quota Cap & Quiet Hours:**
   * Batas maksimal kirim harian per akun (default: 100 pesan/hari untuk akun baru, hingga 300 pesan/hari untuk akun lama).
   * Fitur *Quiet Hours* menjeda pengiriman otomatis pada malam hari (21:00 – 07:00) untuk mencegah komplain spam dari penerima.
6. **Auto-Blacklist (Opt-out / Unsubscribe):**
   * Jika pesan promosi menyertakan arahan opt-out dan pelanggan membalas "STOP", sistem secara otomatis mendaftarkan nomor tersebut ke tabel `ContactBlacklist` dan membatalkan seluruh pesan antrean ke nomor tersebut.

### 3.3 Auto-Reply Bot & Escalation System
* **Keyword & Tree Menu Engine:**
  * Pencocokan pola kata kunci (`EXACT`, `CONTAINS`, `REGEX`) serta navigasi menu angka.
* **AI Fallback:**
  * Integrasi opsional OpenAI / Gemini untuk menjawab pertanyaan di luar cakupan kata kunci berdasarkan FAQ/SOP bisnis.
* **Handover & Bot Auto-Pause:**
  * Jika percakapan dialihkan ke CS (`NEEDS_AGENT`) atau staf CS mulai mengetik balasan manual, bot otomatis beralih ke mode senyap (*paused*) pada percakapan tersebut agar tidak menyela percakapan antara staf CS dan pelanggan.

### 3.4 Multi-Agent CS & Pelacakan Audit Trail
* **Shared Realtime Inbox:**
  * Staf CS dapat login ke web dashboard, melihat antrean chat masuk, dan mengklaim percakapan (*Assign to me*).
* **Audit Metadata ("Siapa yang Balas"):**
  * Setiap baris pesan keluar di tabel database mencatat:
    * `sender_type`: `'BOT'` | `'AGENT'` | `'SYSTEM'`
    * `agent_id`: UUID staf CS yang membalas (NULL jika bot/sistem)
    * `agent_name`: Nama staf CS (tercatat permanen untuk audit histori)
  * Di layar WhatsApp pelanggan, pesan muncul secara alami dari nomor WhatsApp resmi perusahaan. Namun di sisi internal, tercatat detail staf yang bertanggung jawab.

### 3.5 Reporting & Analytics Module
* **CS Productivity Report:** Jumlah percakapan yang ditangani per staf, *Average First Response Time* (waktu tunggu respon pertama), dan durasi penyelesaian tiket.
* **WhatsApp Accounts Traffic & Health:** Total pesan masuk/keluar per akun, sisa kuota aman harian, dan riwayat status koneksi.
* **Broadcast Campaign Metrics:** Jumlah total target, berhasil terkirim, centang dua/terbaca, pesan gagal (nomor tidak terdaftar), dan rasio unsubscribe.
* **Export Data:** Dukungan ekspor laporan ke format CSV / Excel.

---

## 4. Database Schema (Prisma PostgreSQL)

```prisma
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
  authKeysJson    Json?          // Baileys multi-device auth state
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
  id             String           @id @default(uuid())
  conversationId String
  conversation   Conversation     @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  direction      MessageDirection
  senderType     SenderType
  agentId        String?
  agent          User?            @relation("AgentMessages", fields: [agentId], references: [id])
  agentNameSnapshot String?
  text           String
  mediaUrl       String?
  status         MessageStatus    @default(PENDING)
  failureReason  String?
  createdAt      DateTime         @default(now())
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
  messageTemplate String           // Format Spintax
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

---

## 5. Error Handling, Resilience & Safety Tripwires

1. **Safety Tripwire Pemblokiran Akun:**
   * Jika Baileys mengembalikan status 401/403/Forbidden yang mengindikasikan akun terblokir, akun tersebut segera ditandai `BANNED_DETECTED`.
   * Sistem otomatis memindahkan seluruh antrean pesan aktif milik akun tersebut ke akun lain yang tersedia, dan mengirimkan notifikasi *high-priority* ke dashboard Admin.
2. **Validasi Nomor Tujuan (Non-WhatsApp Checker):**
   * Sebelum pesan dikirim, sistem memeriksa validitas format E.164. Jika API WhatsApp mengembalikan `onWhatsApp = false`, pesan langsung diberi status `FAILED (Not Registered on WhatsApp)` tanpa retry, mencegah degradasi reputasi akun.
3. **Dead Letter & Retry Limits:**
   * Pesan broadcast hanya dicoba ulang maksimal 1 kali jika terjadi kegagalan jaringan sementara. Tidak ada perulangan agresif yang dapat memicu alarm spam.
4. **Isolasi Kegagalan Sesi:**
   * Gangguan pada salah satu nomor WhatsApp tidak akan memengaruhi operasional nomor WhatsApp lainnya maupun kestabilan dashboard web.

---

## 6. Testing Strategy & Simulation Mode

1. **Unit Testing:**
   * Parser Spintax: Memastikan semua permutasi token `{A|B|C}` tervalidasi tanpa kebocoran sintaks.
   * E.164 Phone Sanitizer: Menguji konversi nomor input lokal (`0812...`, `+62...`, spasi/strip) ke format baku WhatsApp (`62812...@s.whatsapp.net`).
   * Queue Delay Generator: Memvalidasi rentang jeda acak (8–22 detik) dan jeda batch cooldown.
2. **Integration Testing:**
   * Autentikasi CS & Multi-Agent tracking: Memverifikasi bahwa setiap pesan keluar menyimpan `agent_id` dan `agentNameSnapshot` yang valid.
   * Bot Rule Matching: Memverifikasi auto-reply dan transisi status percakapan saat handover ke agen.
3. **Dry-Run / Sandbox Simulator:**
   * Pengguna dapat menjalankan kampanye broadcast dalam mode simulasi untuk melihat preview variasi teks spintax, estimasi durasi selesai, dan distribusi beban multi-akun tanpa mengirimkan pesan nyata ke jaringan WhatsApp.

# Design Specification: End-to-End WA-CRM Revamp (Live Inbound, Top Navigation, Bot Manager, Contact Sync, & Broadcast Phone Mockup)

**Date:** 2026-10-06  
**Status:** Validated & Approved  
**Author:** Antigravity & User  
**Target Architecture:** Modular Monolith (Node.js/TypeScript + PostgreSQL + Baileys + Socket.IO)

---

## 1. Executive Summary & Goals

Dokumen ini mendefinisikan penyempurnaan menyeluruh sistem WA-CRM berdasarkan validasi langsung:
1. **Autentikasi & Role Security:** Halaman login formal (Email & Password), pemisahan peran Admin vs Staf CS, dan session logout.
2. **Top Navigation Bar:** Memindahkan seluruh navigasi dari sidebar ke header atas (Top Navbar) agar antarmuka luas, tidak ruwet, dan fokus pada konten.
3. **Live Inbox CS & Penangkap Pesan Masuk (Realtime Inbound):** Menghubungkan event `messages.upsert` dari WhatsApp Baileys ke database dan Socket.IO, sehingga pesan pelanggan masuk secara realtime ke dashboard, memicu auto-reply bot di awal, dan memungkinkan staf CS mengambil alih obrolan (*handover/takeover*) dengan audit trail ("Siapa yang Balas").
4. **Halaman Pengaturan Menu Bot & Sandbox:** Menu khusus di web (`/bot-rules`) untuk menambah, mengedit, mengaktifkan/menonaktifkan kata kunci bot (Exact, Contains, Menu Angka), serta simulator uji coba bot langsung di web.
5. **Buku Kontak & Sinkronisasi dari WhatsApp HP:** Menarik seluruh kontak yang tersimpan di WhatsApp HP (`contacts.upsert`) ke database kontak PostgreSQL, melihat kontak tersimpan di tab Kontak, dan memilih kontak langsung saat broadcast.
6. **Perombakan UI/UX Broadcast (Smart Editor & Phone Simulator):**
   * Editor kiri: Pemilih template favorit, toolbar Smart Chips satu klik (`[+ Nama]`, `[+ Salam]`, `[+ Tombol STOP]`), upload file CSV/TXT, dan tombol ambil kontak dari HP.
   * Simulator kanan: Bingkai smartphone WhatsApp dengan balon chat hijau live dan tombol uji acak Spintax.
7. **Agregasi Metrik KPI:** Menghitung total pesan terkirim secara akurat (menggabungkan pesan chat dan pesan broadcast), serta membedakan balasan bot vs balasan staf CS.

---

## 2. Layout & UI Architecture (Top Navigation Bar)

Struktur antarmuka diubah dari sidebar samping ke **Header Atas (Top Navbar)**:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [WA-CRM.PRO]   [💬 Live Inbox]  [📱 Akun WA]  [👥 Kontak]  [🤖 Bot]  [🚀 Broadcast]  [📊 Laporan] │ [👤 Siti (CS) ▼] [🚪 Keluar] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

* **Keuntungan:** Layar penuh 100% dialokasikan untuk konten percakapan dan kolom editor broadcast tanpa terhimpit sidebar.
* **Responsive:** Pada layar mobile/tablet, navbar atas runtuh (*collapse*) menjadi menu dropdown hamburger.

---

## 3. Subsystem Specifications

### 3.1 Authentication & Role-Based Access Control (RBAC)
* **Login Screen:** Modal atau view login bersih untuk input Email & Password.
* **Peran Pengguna:**
  * `ADMIN`: Akses penuh ke Akun WA, Aturan Bot, Broadcast, Buku Kontak, dan Laporan.
  * `AGENT`: Dibatasi ke Live Inbox CS dan Buku Kontak. Otomatis terkunci pada identitas staf yang sedang login saat mengirim pesan keluar.
* **Sesi:** Token JWT disimpan di `localStorage` dan diverifikasi pada setiap request API.

### 3.2 Live Inbox & Penangkap Pesan Masuk (Realtime Inbound)
* **Event Baileys:** Menghubungkan `socket.ev.on('messages.upsert')` pada `SessionManager`.
* **Alur Penanganan:**
  1. Cek tipe event (`notify`), jika pesan bukan dari diri sendiri (`!msg.key.fromMe`) dan bukan pesan grup:
  2. Ekstrak teks pesan, nomor pengirim (`senderJid`).
  3. Panggil `handleInboundMessage(accountId, senderJid, text)`:
     - Cari/buat record `Contact` di PostgreSQL.
     - Cari/buat record `Conversation`.
     - Simpan baris `Message` bertipe `INBOUND`.
     - Jika status percakapan `BOT_ACTIVE`, cocokkan dengan `BotRule`:
       - Jika aturan `HANDOVER_AGENT`: ubah status menjadi `NEEDS_AGENT`, simulasikan typing, kirim balasan transisi.
       - Jika aturan `REPLY`: simulasikan typing 1.5 detik, kirim balasan otomatis, simpan `Message` bertipe `BOT`.
  4. Pancarkan event `chat:inbound` via Socket.IO ke browser.
* **Interaksi CS:**
  - Tombol *"📌 Ambil Chat Ini"* memanggil `POST /api/conversations/:id/assign`.
  - Tombol *"Kirim"* memanggil `POST /api/conversations/:id/reply` dengan mencatat `agentId` dan `agentNameSnapshot`.

### 3.3 Halaman Aturan & Menu Bot (Bot Rules Manager)
* **Endpoint API:**
  - `GET /api/bot-rules`: Mengambil daftar seluruh aturan bot.
  - `POST /api/bot-rules`: Membuat aturan bot baru.
  - `PUT /api/bot-rules/:id`: Memperbarui aturan (teks, kata kunci, toggle aktif).
  - `DELETE /api/bot-rules/:id`: Menghapus aturan.
* **Antarmuka Web:**
  - Tabel/Kartu daftar aturan bot (Trigger, Keyword, Balasan, Aksi, Switch Aktif).
  - Modal form tambah/edit aturan.
  - Kotak simulator uji coba respons bot di sisi kanan.

### 3.4 Buku Kontak & Sinkronisasi Kontak WhatsApp HP
* **Sinkronisasi dari HP:**
  - Baileys menangani `contacts.upsert`.
  - Endpoint `POST /api/contacts/sync/:accountId` meminta sinkronisasi kontak dari sesi WhatsApp aktif.
  - Menyimpan nomor dan nama kontak ke tabel `Contact`.
* **Antarmuka Buku Kontak:**
  - Tabel daftar kontak (Nama, Nomor, Status Aktif/Blacklist, Tanggal).
  - Tombol *"🔄 Tarik Kontak dari WhatsApp HP"*.
  - Tombol *"Tambah Kontak Manual"* dan *"Export CSV"*.

### 3.5 UI/UX Baru Broadcast (Smart Editor & Phone Simulator)
* **Kolom Kiri (Editor Cerdas):**
  - Judul kampanye.
  - Sumber kontak: Pilihan tombol *"Gunakan Kontak WhatsApp HP"*, *"Upload File CSV/TXT"*, atau paste manual dengan badge hitungan valid.
  - Dropdown Template Favorit (*Preset Library*) dan tombol *"Simpan Template"*.
  - Toolbar Smart Chips (1-klik sisipkan `{name}`, salam acak `{Halo|Hai}`, sapaan acak `{Kak|Pak|Bu}`, tombol `STOP`).
  - Checklist proteksi anti-ban (delay acak 8-22 dtk, batch cooldown 60 dtk, presence typing).
* **Kolom Kanan (WhatsApp Phone Simulator):**
  - Bingkai smartphone dengan header WhatsApp resmi.
  - Balon chat hijau WhatsApp ter-render realtime saat pengguna mengetik.
  - Tombol *"🎲 Uji Acak Variasi Pesan"* untuk menguji keacakan Spintax.

### 3.6 Agregasi Metrik Laporan KPI
* `GET /api/reports/summary` disempurnakan:
  - `totalContacts`: hitungan tabel `Contact`.
  - `totalMessages`: hitungan pesan chat keluar (`Message`) + pesan broadcast terkirim (`BroadcastQueue.status = 'SENT'`).
  - `botReplies`: hitungan pesan bertipe `BOT`.
  - `agentReplies`: hitungan pesan bertipe `AGENT`.

---

## 4. Database Schema Impact

Skema PostgreSQL yang sudah ada (`prisma/schema.prisma`) sudah mencakup semua model yang dibutuhkan: `User`, `WhatsappAccount`, `Contact`, `Conversation`, `Message`, `BotRule`, `BroadcastCampaign`, `BroadcastQueue`. Tidak ada breaking perubahan pada skema database, hanya perlu penambahan endpoint REST dan integrasi event Baileys.

---

## 5. Testing & Verification

1. **Unit Testing:**
   - Uji penangkap inbound message dan bot rule evaluation.
   - Uji sinkronisasi kontak dan normalisasi nomor E.164.
   - Uji endpoint CRUD bot rules dan contacts.
2. **Integration Testing:**
   - Uji aliran Socket.IO `chat:inbound` dan pembaruan live inbox.
   - Uji simulasi pesan WhatsApp masuk dan respon bot.
3. **Verifikasi Browser:**
   - Navigasi navbar atas berfungsi mulus di semua resolusi.
   - Phone simulator merender balon chat hijau WhatsApp secara realtime.

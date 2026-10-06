# 🚀 WA-CRM | WhatsApp Automation, Multi-Agent CRM & Anti-Ban Platform

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v20%2B-green?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Database-PostgreSQL-336791?logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/ORM-Prisma-2D3748?logo=prisma" alt="Prisma">
  <img src="https://img.shields.io/badge/Engine-Baileys%20Multi--Device-25D366?logo=whatsapp" alt="Baileys">
  <img src="https://img.shields.io/badge/Realtime-Socket.IO-black?logo=socket.io" alt="Socket.IO">
  <img src="https://img.shields.io/badge/Tests-19%20Passed-success" alt="Tests">
</p>

Aplikasi otomasi WhatsApp multi-akun berbasis web yang dirancang untuk kebutuhan **Customer Service (Multi-Agent CS)**, **Broadcast Otomatis**, dan **Bot Auto-Reply** dengan pertahanan **Anti-Banned** tingkat tinggi.

---

## 🌟 Fitur Utama

### 1. 🛡️ Mesin Keamanan Anti-Banned Berlapis
* **Jeda Acak Manusiawi (Human Delay):** Jeda waktu pengiriman acak dinamis (default: **8 s/d 22 detik** per pesan), menghindari deteksi pola bot statis.
* **Batch Cooldown:** Sistem otomatis beristirahat selama 60 detik setiap kali mengirim 20 pesan berturut-turut.
* **Simulasi Pengetikan (Presence Typing):** Mengirim sinyal `composing` (indikator *"sedang mengetik..."*) sebelum pesan ditembakkan ke WhatsApp.
* **Mesin Spintax:** Mendukung variasi format template bersarang: `{Halo|Hai|Selamat {pagi|siang}} {Kak|Bapak|Ibu}`, sehingga setiap penerima menerima susunan kalimat yang unik.
* **Rotasi Multi-Akun Otomatis:** Beban pengiriman kampanye didistribusikan secara bergantian ke nomor-nomor aktif yang masih memiliki sisa kuota harian.
* **Batas Kuota Harian (Daily Cap):** Pengaman batas maksimal kirim harian per akun (default: 150/hari) untuk mencegah akun kelelahan.
* **Auto-Blacklist (Opt-out STOP):** Jika penerima membalas kata **"STOP"**, nomor otomatis masuk ke daftar blacklist dan sisa broadcast dibatalkan (mencegah penerima mengklik tombol *"Report Spam"*).

### 2. 💬 Shared Live Inbox CS ("Siapa yang Balas")
* **Multi-Agent Shared Inbox:** Semua chat dari seluruh nomor WA terpusat dalam satu tampilan web realtime ala WhatsApp Web.
* **Audit Trail Transparan:** Setiap pesan keluar mencatat nama staf CS yang mengetik (`senderType: 'AGENT'`, `agentId`, dan `agentNameSnapshot`).
* **Handover & Bot Auto-Pause:** Bot otomatis dijeda pada percakapan yang sedang ditangani staf CS manusia agar tidak saling tumpang tindih.

### 3. 🤖 Bot Auto-Reply & Menu Angka
* **Keyword Matching:** Menjawab otomatis berdasarkan kata kunci *Exact*, *Contains*, atau *Menu Angka* (misal: "Ketik 1 untuk info produk, 2 untuk CS").
* **Eskalasi Otomatis:** Transisi otomatis status chat dari `BOT_ACTIVE` menjadi `NEEDS_AGENT` saat pelanggan meminta bantuan staf.

### 4. 📊 Laporan & Analitik Audit
* **Metrik KPI:** Rekap total kontak, total pesan keluar, pesan bot, dan pesan CS.
* **Laporan Kinerja Staf CS:** Memantau jumlah pesan yang dikirim dan chat yang ditangani per masing-masing staf.
* **Kesehatan Akun WhatsApp:** Memantau status koneksi, kuota terpakai hari ini, dan sisa batas kuota aman.
* **Ekspor CSV:** Unduh log riwayat percakapan lengkap ke format `.csv` dengan satu klik.

---

## 🛠️ Tech Stack

* **Backend:** Node.js (v20+ LTS), Express.js, TypeScript
* **Database:** PostgreSQL (didukung Prisma ORM untuk transaksi aman tanpa data-lock)
* **WhatsApp Engine:** `@whiskeysockets/baileys` (Multi-Device Protocol)
* **Realtime Layer:** Socket.IO
* **Frontend:** Modern Responsive Single Page App (Dark Theme, Glassmorphism, CSS Custom Properties)
* **Testing:** Vitest (10 test suites, 19 tests passing)

---

## 📁 Struktur Folder

```text
wa-crm/
├── prisma/
│   └── schema.prisma         # Skema database PostgreSQL
├── public/
│   ├── css/
│   │   └── style.css         # Styling modern dark-mode & glassmorphism
│   ├── js/
│   │   └── app.js            # Frontend logic & Socket.IO realtime handler
│   └── index.html            # Antarmuka dashboard web
├── src/
│   ├── api/
│   │   ├── accounts.ts       # Manajemen akun WhatsApp & Scan QR
│   │   ├── auth.ts           # Autentikasi CS & User management
│   │   ├── campaigns.ts      # Pembuatan broadcast & antrean
│   │   ├── conversations.ts  # Live chat & pelacakan balasan CS
│   │   └── reports.ts        # Analitik & ekspor log CSV
│   ├── bot/
│   │   └── rule-engine.ts    # Logika pencocokan aturan bot auto-reply
│   ├── config/
│   │   └── index.ts          # Pengaturan env & parameter anti-ban
│   ├── database/
│   │   └── client.ts         # Inisialisasi Prisma Client
│   ├── queue/
│   │   └── dispatcher.ts     # Background worker antrean pesan & anti-ban
│   ├── utils/
│   │   ├── delay.ts          # Kalkulator jeda acak & sleep
│   │   ├── phone.ts          # Normalisasi format E.164 WhatsApp
│   │   └── spintax.ts        # Parser permutasi kata acak Spintax
│   ├── whatsapp/
│   │   ├── inbound-handler.ts# Router pesan masuk & pemicu bot
│   │   └── session-manager.ts# Pengelola multi-sesi Baileys
│   ├── index.ts              # Entry point aplikasi
│   └── server.ts             # Server Express & Socket.IO
├── tests/                    # 10 unit & integration test suites
└── package.json
```

---

## 🚀 Panduan Instalasi & Menjalankan

### 1. Clone Repositori
```bash
git clone git@github.com:xmous/wa-crm.git
cd wa-crm
```

### 2. Pasang Dependensi
```bash
npm install
```

### 3. Konfigurasi Environment (`.env`)
Salin file `.env.example` ke `.env`:
```bash
cp .env.example .env
```
Sesuaikan konfigurasi database PostgreSQL Anda di `.env`:
```env
PORT=3000
DATABASE_URL="postgresql://postgres:PASSWORD_ANDA@localhost:5432/waweb?schema=public"
JWT_SECRET="super-secret-jwt-key-for-crm"
ANTI_BAN_MIN_DELAY=8000
ANTI_BAN_MAX_DELAY=22000
ANTI_BAN_BATCH_SIZE=20
ANTI_BAN_COOLDOWN_MS=60000
```

### 4. Sinkronisasi Database (Prisma)
Jalankan sinkronisasi skema ke database PostgreSQL:
```bash
npx prisma db push
```

### 5. Jalankan Aplikasi
Untuk mode pengembangan (*development mode* dengan auto-reload):
```bash
npm run dev
```

Buka browser Anda di:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🧪 Menjalankan Pengujian (Testing)

Untuk memverifikasi semua pengujian Anti-Banned, Spintax, Bot Rules, dan API:
```bash
npm test
```

---

## 📜 Lisensi & Pembuat

Dibuat dengan ❤️ oleh **[xmous](https://github.com/xmous)**.  
Dilisensikan di bawah lisensi MIT.

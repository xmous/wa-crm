# Spesifikasi Desain: Autentikasi Pengguna, Audit Alur, & Kesiapan Produksi (WA-CRM Pro)

**Tanggal:** 06 Oktober 2026  
**Status:** Disetujui  
**Penulis:** Tim Engineering WA-CRM  

---

## 1. Latar Belakang & Tujuan

Aplikasi WA-CRM Pro telah berhasil mengimplementasikan multi-akun WhatsApp, Live Inbox dua arah, bot auto-reply berbasis kata kunci, broadcast anti-banned dengan Spintax dinamis, dan sinkronisasi kontak.

Namun, untuk dapat di-deploy dan digunakan secara aman pada server produksi (VPS), sistem membutuhkan:
1. **Sistem Autentikasi & Otorisasi Pengguna (Role-Based Access Control / RBAC)**: Mencegah akses langsung tanpa login, membedakan hak akses Admin dan Staff CS (Agent), dan mengamankan seluruh REST API dengan JWT token.
2. **Audit & Penyempurnaan Alur (Flow Hardening & Bug Prevention)**: Menjamin deduplikasi pesan, memastikan pertukaran kunci enkripsi WhatsApp (E2EE pre-keys) berjalan lancar sehingga tidak timbul pesan *"Menunggu pesan ini..."*, serta sinkronisasi status pengiriman centang centang (`✓`, `✓✓`, `✓✓ biru`).
3. **Kesiapan Server Produksi (Production Readiness)**: Konfigurasi PM2 Process Manager (`ecosystem.config.js`), skrip build produksi, struktur logging, dan panduan environment variabel.

---

## 2. Arsitektur Autentikasi & Keamanan

### 2.1 Model Pengguna & Role
Sistem menggunakan model `User` yang sudah ada di database PostgreSQL (`prisma.user`):
- **Role `ADMIN`**:
  - Akses penuh ke seluruh menu: Live Inbox, Akun WA, Buku Kontak, Aturan Bot, Broadcast, dan Laporan.
- **Role `AGENT` (Staff CS)**:
  - Akses terbatas: Live Inbox dan Buku Kontak.
  - Tab sensitif (Akun WA, Aturan Bot, Broadcast, Laporan) disembunyikan di antarmuka dan diblokir di tingkat API.

Kredensial bawaan yang telah aktif:
- `admin@wa-crm.io` (Admin Utama, role: `ADMIN`, password: `password123`)
- `siti@wa-crm.io` (Siti Nurhaliza, role: `AGENT`, password: `password123`)
- `budi@wa-crm.io` (Budi Santoso, role: `AGENT`, password: `password123`)

### 2.2 Endpoint REST API Autentikasi
1. `POST /api/auth/login`:
   - Menerima: `{ email, password }`
   - Memeriksa `bcrypt.compare` terhadap `passwordHash`.
   - Mengembalikan JWT token (berlaku 7 hari) dan objek pengguna: `{ id, name, email, role }`.
2. `GET /api/auth/me`:
   - Memvalidasi header `Authorization: Bearer <token>`.
   - Mengembalikan data pengguna terkini jika token valid, atau HTTP 401 jika kedaluwarsa/tidak valid.
3. `POST /api/auth/logout`:
   - Mengonfirmasi pengakhiran sesi klien.

### 2.3 Express Auth Middleware (`src/middleware/auth.ts`)
- **`requireAuth`**: Memeriksa keberadaan dan validitas JWT token pada header `Authorization: Bearer <token>`. Jika gagal, mengembalikan HTTP 401. Menyematkan payload pengguna ke `req.user`.
- **`requireRole(allowedRoles: UserRole[])`**: Memeriksa apakah `req.user.role` termasuk dalam role yang diizinkan. Jika tidak, mengembalikan HTTP 403 Forbidden.

### 2.4 Matriks Proteksi Rute API
| Rute API | Metode | Akses Minimal | Deskripsi |
|---|---|---|---|
| `/api/auth/login` | POST | Publik | Masuk ke sistem |
| `/api/auth/me` | GET | `requireAuth` | Verifikasi token pengguna aktif |
| `/api/conversations/*` | ALL | `requireAuth` (`ADMIN` & `AGENT`) | Live Inbox & balasan chat |
| `/api/contacts/*` | ALL | `requireAuth` (`ADMIN` & `AGENT`) | Manajemen buku kontak |
| `/api/accounts/*` | ALL | `requireRole(['ADMIN'])` | Pemasangan & hapus sesi WA |
| `/api/bot-rules/*` | ALL | `requireRole(['ADMIN'])` | Konfigurasi aturan auto-reply |
| `/api/campaigns/*` | ALL | `requireRole(['ADMIN'])` | Kampanye broadcast pesan masal |
| `/api/reports/*` | ALL | `requireRole(['ADMIN'])` | Laporan analitik & produktivitas |

---

## 3. Desain Antarmuka Pengguna (Frontend UI)

### 3.1 Layar Login Modern (Overlay Shield)
- Diterapkan pada `public/index.html` dan dikontrol oleh `public/js/app.js`.
- Jika `localStorage.getItem('token')` kosong atau panggilan `GET /api/auth/me` mengembalikan 401:
  - Layar dashboard disembunyikan / dilapisi modal login layar penuh dengan latar belakang gelap elegan (`glassmorphism`), logo WA-CRM Pro, input Email, Password, tombol "Masuk ke Sistem", dan pesan error responsif.
  - Terdapat tombol pemilihan cepat akun demo (Admin / Siti CS / Budi CS) untuk kemudahan pengujian.
- Saat login berhasil:
  - Token dan data user disimpan di `localStorage`.
  - Layar login tertutup dengan transisi halus.
  - Navbar menampilkan identitas user: nama, role (`ADMIN` / `AGENT`), dan tombol **🚪 Keluar (Logout)**.

### 3.2 Tampilan Berbasis Role (RBAC di Client)
- Jika pengguna yang masuk memiliki role `AGENT`:
  - Tab navigasi **Akun WA**, **Aturan Bot**, **Broadcast**, dan **Laporan** disembunyikan dari navbar.
  - Tampilan otomatis diarahkan dan dikunci ke tab **Live Inbox**.

---

## 4. Audit Alur & Peningkatan Kehandalan (Flow Hardening)

### 4.1 Pertukaran Kunci Enkripsi Baileys (Pencegahan "Menunggu pesan ini...")
- Saat sesi Baileys terhubung (`connection.update` status `open`), sistem memanggil `uploadPreKeysToServer` jika cadangan pre-key di server kurang dari 10.
- Ini memastikan WhatsApp Web Multi-Device selalu memiliki kunci publik yang siap diambil oleh perangkat penerima baru, mencegah keterlambatan dekripsi pesan.

### 4.2 Deduplikasi & Integritas Pengiriman
- Setiap permintaan HTTP dari frontend otomatis menyematkan header `Authorization: Bearer <token>`.
- Tombol kirim pesan dan form broadcast memiliki proteksi disable saat request sedang berlangsung untuk menghindari pengiriman ganda.
- Penanda pengirim pesan memuat nama staff dan akun WA yang aktif (misal `Admin Utama (via Mephist)` atau `HP WhatsApp (dinda)`).
- Penanda status WhatsApp (`✓`, `✓✓`, `✓✓ biru`) terhubung secara real-time ke event `messages.update`.

---

## 5. Kesiapan Produksi & Deployment Server

### 5.1 PM2 Configuration (`ecosystem.config.js`)
- Nama aplikasi: `wacrm-pro`
- Skrip: `dist/index.js` (atau `src/index.ts` via tsx/ts-node pada mode staging)
- Mode eksekusi: `fork` (sesi Baileys WebSocket membutuhkan single process instance agar auth keys tidak race condition)
- `autorestart: true`
- `max_memory_restart: '1G'`
- File log: `logs/pm2-out.log` dan `logs/pm2-err.log`

### 5.2 Skrip Build & Package
- `npm run build`: Mengompilasi TypeScript ke folder `dist/` menggunakan `tsc`.
- `npm run start`: Menjalankan server hasil kompilasi `node dist/index.js`.
- File panduan `.env.example` yang mencakup:
  - `PORT=3000`
  - `DATABASE_URL=postgresql://user:pass@localhost:5432/wacrm`
  - `JWT_SECRET=super_secret_jwt_key_wacrm_production`
  - `NODE_ENV=production`

---

## 6. Rencana Pengujian & Validasi

1. **Uji Autentikasi & Otorisasi**:
   - Memastikan request tanpa header Authorization ke `/api/conversations` ditolak dengan HTTP 401.
   - Memastikan login dengan `admin@wa-crm.io` / `password123` berhasil dan mengembalikan token valid.
   - Memastikan user role `AGENT` ditolak dengan HTTP 403 saat mengakses `/api/campaigns`.
2. **Uji Alur UI**:
   - Validasi bahwa form login muncul saat token dihapus.
   - Validasi bahwa tab Admin tersembunyi untuk akun Agent.
   - Validasi fungsi Logout menghapus sesi dan mengembalikan form login.
3. **Uji Regresi Fitur Eksisting**:
   - Menjalankan seluruh test suite Vitest (13 suite, 22 test) untuk memastikan tidak ada fitur WA atau database yang rusak.

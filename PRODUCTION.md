# TaskFlow API - Panduan Production Deployment

Dokumen ini berisi panduan lengkap untuk menjalankan dan memelihara backend TaskFlow API di lingkungan production.

---

## 📋 1. Checklist Environment Variables (.env)

Sebelum menjalankan aplikasi di production, pastikan Anda telah menduplikasi file `.env.example` menjadi `.env` dan mengisi variabel-variabel sensitif dengan nilai yang benar:

```bash
cp .env.example .env
```

| Variabel | Deskripsi | Rekomendasi Production |
| :--- | :--- | :--- |
| `NODE_ENV` | Mode aplikasi | `production` |
| `PORT` | Port server backend | `5000` atau sesuai kebutuhan |
| `MONGODB_URI` | Connection string MongoDB | Gunakan MongoDB Atlas cluster yang secure |
| `JWT_SECRET` | Secret key untuk signing JWT | Gunakan string acak panjang dan aman (min 32 karakter) |
| `EMAIL_USER` / `EMAIL_PASS` | Kredensial email pengirim | Gunakan App Password (misal Gmail) atau SMTP Relay (Sendgrid/Mailgun) |
| `CLOUDINARY_*` | Kredensial penyimpanan file Cloudinary | Akun Cloudinary production |
| `FRONTEND_URL` | Domain frontend yang diizinkan (CORS) | Contoh: `https://taskflow.yourdomain.com` |

---

## 🚀 2. Metode Deployment

Pilih salah satu metode deployment di bawah ini yang sesuai dengan infrastruktur server Anda:

### Metode A: Menggunakan PM2 (Direkomendasikan untuk VPS/Server tanpa Docker)
PM2 adalah Node.js process manager yang akan menjaga aplikasi tetap hidup, melakukan clustering di multi-core CPU, dan mengelola log otomatis.

1. **Instal PM2 secara global:**
   ```bash
   npm install pm2 -g
   ```
2. **Jalankan aplikasi menggunakan konfigurasi PM2:**
   ```bash
   pm2 start ecosystem.config.json --env production
   ```
3. **Perintah PM2 yang sering digunakan:**
   - Melihat status: `pm2 status`
   - Melihat log real-time: `pm2 logs taskflow-api`
   - Restart aplikasi: `pm2 restart taskflow-api`
   - Menyimpan daftar proses agar restart saat server reboot: `pm2 save`

---

### Metode B: Menggunakan Docker & Docker Compose (Sangat Direkomendasikan)
Docker mengisolasi aplikasi di dalam kontainer sehingga menjamin konsistensi antara local development dan server production.

1. **Build dan Jalankan Container:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```
2. **Cek status kontainer & Health Check:**
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```
3. **Melihat Log Kontainer:**
   ```bash
   docker compose -f docker-compose.prod.yml logs -f taskflow-api
   ```
4. **Menghentikan Layanan:**
   ```bash
   docker compose -f docker-compose.prod.yml down
   ```

---

### Metode C: Menjalankan Langsung dengan Node.js (Basic)
Gunakan metode ini jika Anda menggunakan platform PaaS seperti Heroku, Render, atau Railway yang menangani proses restart dan clustering secara otomatis.

1. **Instal dependensi production saja:**
   ```bash
   npm install --production
   ```
2. **Jalankan aplikasi:**
   ```bash
   NODE_ENV=production npm start
   ```

---

## 🪵 3. Manajemen Log (Logger)

Aplikasi ini menggunakan logger terstruktur berbasis `winston`. Ketika berjalan dalam mode `production` (`NODE_ENV=production`), log tidak hanya akan dicetak di console tetapi juga disimpan ke dalam file di direktori `logs/`:

- **`logs/error.log`**: Menyimpan semua log bertipe `error` beserta stack trace-nya. Sangat berguna untuk debugging masalah server di production.
- **`logs/combined.log`**: Menyimpan semua log dari level `info` ke atas (termasuk HTTP request logging dari Morgan).

*Catatan: Konfigurasi file log telah dilengkapi pembatasan ukuran file maksimal (10MB untuk combined, 5MB untuk error) dan rotasi maksimum 5 file untuk mencegah kepenuhan disk space.*

---

## 🛡️ 4. Rekomendasi Keamanan & Performa

1. **Reverse Proxy (Nginx / Caddy):**
   Gunakan reverse proxy di depan port Node.js Anda untuk menangani SSL/TLS (HTTPS) termination, kompresi tambahan, dan static file serving.
2. **Trust Proxy:**
   Karena server dikonfigurasi dengan `app.set('trust proxy', 1)` di production, pastikan Nginx/Cloudflare Anda mengirimkan header `X-Forwarded-For` yang valid agar rate limiting bekerja dengan benar.
3. **MongoDB Security:**
   Pastikan port MongoDB (27017) Anda tidak terbuka untuk publik dan hanya dapat diakses melalui autentikasi user-password yang kuat.

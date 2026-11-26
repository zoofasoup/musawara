# Rancangan: mode CRM-saja

26 Nov 2026. Istilah mengikuti `GLOSSARY.md`. Keputusan arsitektur: `docs/adr/0001-satu-kode-satu-salinan-per-bisnis.md`.

## Tujuan dan ukuran selesai

Satu Salinan percobaan dipasang dengan skrip. Di situ Owner bisa login, scan QR, menerima dan membalas chat, memindahkan kartu pipeline, dan mengirim broadcast kecil. Tidak ada menu, halaman, atau nama agensi. Pesan percobaan hanya ke nomor yang disetujui pemilik. Platform Musawara berperilaku sama seperti sebelumnya.

Pasar versi pertama: travel umroh.

## Saklar

- Worker: variabel `APP_MODE=crm`. Aplikasi web: `VITE_APP_MODE=crm` saat build.
- Tanpa variabel itu, perilaku tidak berubah.

## Server (Worker)

Penguncian ada di server; menyembunyikan menu saja tidak cukup. Di mode CRM, yang tidak terdaftar di sini menjawab 404:

- `/api/auth`, `/api/crm`, `/api/pipeline`, `/api/crm-tasks`, `/api/crm-ads`, `/api/health`.
- `/api/admin`: hanya pengguna (`/users*`), undangan (`/invites*`), dan baca daftar `/clients`.

Peran yang ada: Owner dan Staf CRM. Staf CRM tidak mendapat fitur `sales`. Server menolak undangan peran lain, termasuk login klien.

Pintu masuk Salinan harus tetap membawa pemeriksaan Origin, pembatas percobaan login (`AUTH_LIMITER`), dan header keamanan. Semua itu sekarang ada di `worker/index.ts` (root), bukan di `admin/worker`, dan `admin/wrangler.jsonc` yang berdiri sendiri tidak memilikinya.

Jadwal: hanya sinkron lead dari inbox. Sinkron iklan, organik, Shopee, Jubelio, dan Notion tidak jalan. `GET /api/health?deep=1` tidak boleh gagal karena jadwal yang memang tidak ada.

## Akses Staf CRM

Aturan akses sekarang dipakai apa adanya: tiap Salinan punya satu baris internal di tabel `clients` yang mewakili Bisnis (nama tabel di kode, bukan Klien agensi). Skrip membuatnya. Nomor baru otomatis ditautkan ke data itu, Staf CRM yang diundang otomatis diberi akses ke situ, dan pilihan "Brand" di halaman Numbers disembunyikan.

## Aplikasi web

- Menu: CRM, Pengaturan (isinya tim), Profil. Halaman lain dan halaman bagikan publik tidak ada di build ini.
- Aplikasi dilayani di `/` (build platform memakai `/admin/`).
- Nama dan logo produk diambil dari satu berkas pengaturan. Nama sementara dipakai sampai nama asli diputuskan, sebelum Bisnis pertama.
- Bahasa awal Indonesia, tombol ganti bahasa tetap ada. Semua teks di CRM, login, undangan, tim, pengaturan, dan profil harus punya terjemahan, termasuk kalimat yang dirangkai dari data.
- Field siap pakai: hanya "Travel umroh" (isi sama dengan preset Musafar, tanpa nama Musafar). Preset NurAlive tidak ditawarkan.
- Kartu "datang dari iklan" tetap ada, memakai data yang dikirim WhatsApp. Tidak perlu token Meta.

## Gateway

Satu proses per Salinan dengan folder data, port, dan token sendiri, di server yang sama. Maksimal 3 Nomor.

Saklar baru (hanya API) mematikan halaman acara, halaman publik, dan tampilan web lama, sehingga yang terbuka tanpa token hanya `/api/health`. Nomor pertama di data baru tidak lagi bernama "Nuralive". Gateway Musawara tidak berubah tanpa saklar itu.

## Alamat dan pemasangan

Tiap Salinan memakai subdomain `namabisnis.<domain-produk>`; domain dibeli setelah nama diputuskan, sebelum itu pakai alamat uji.

Satu skrip, dijalankan kita:

1. Membuat database baru dan menerapkan semua migrasi.
2. Menulis konfigurasi Worker Salinan itu (nama, database, nomor `AUTH_LIMITER` unik).
3. Membuat rahasia baru dan memasangnya tanpa mencetak atau menyimpannya di repo.
4. Menyiapkan proses gateway, alamatnya, dan backup harian databasenya di server (pakai skrip di `wa-crm/deploy/`). Database itu menyimpan semua kontak dan chat Bisnis.
5. Membuat Owner pertama, baris `clients` internal, dan Akun bantuan.

## Akun bantuan

Akun Owner milik kita, terlihat di daftar Tim, bisa dihapus Owner Bisnis. Perjanjian menyebut dua hal: kita secara teknis tetap bisa mengakses data karena menjalankan server, dan hanya membukanya atas permintaan Bisnis atau saat gangguan.

## Pengujian

- Tes peran diperluas: di mode CRM, tiap area agensi menjawab 404 dan peran lain ditolak.
- Tes bahwa tanpa saklar, matriks akses sekarang tetap sama.
- Tes gateway untuk saklar hanya-API: halaman acara dan publik tidak terbuka.
- Uji lokal dengan data palsu, desktop dan lebar 375px.
- Uji ukuran selesai di Salinan percobaan.

## Tidak termasuk

Batas kirim, salam otomatis, ekspor data, tagihan dan status langganan, multi-tenant, WhatsApp API resmi.

## Urutan setelah ini

1. Salinan demo (berisi data palsu).
2. Batas kirim.
3. Ekspor, salam otomatis, tagihan, dan cek keamanan. Cek keamanan wajib sebelum Bisnis pertama.

Ini mengubah rencana 25 Nov yang menaruh demo paling awal, karena demo memakai mode CRM-saja.

## Risiko dan hal yang dipastikan saat menyusun rencana kerja

- Koneksi WhatsApp tidak resmi: nomor Bisnis bisa diblokir.
- Kapasitas server (satu browser per Nomor) belum diukur; ukur sebelum Bisnis kedua.
- Pastikan Owner bisa menghapus Owner lain (Akun bantuan).
- Pastikan tidak ada benturan kepentingan bila Bisnis adalah pesaing Musafar.
- Perkiraan 2 sampai 3 hari kerja dibuat sebelum saklar gateway dan terjemahan masuk; hitung ulang di rencana kerja.

import type { CaseStudy, JobOpening, LedgerRow } from './types'

/**
 * DEVELOPMENT FIXTURE — mirrors supabase/seed.sql + seed-preview.sql.
 *
 * This exists so the site can be run and reviewed without database
 * credentials. It is served ONLY when Supabase is unconfigured AND
 * NODE_ENV !== 'production'; see content.ts, which throws rather than falling
 * back in a production build.
 *
 * The figures below are UNVERIFIED DRAFTS and the salary ranges are invented.
 * Nothing here should be treated as publishable copy.
 */

const MUSAFAR = { name: 'Musafar', slug: 'musafar', category: 'Travel Umroh Premium' }
const NURALIVE = { name: 'NurAlive', slug: 'nuralive', category: 'Suplemen Herbal' }
const MUSALAND = { name: 'Musaland', slug: 'musaland', category: 'Logistik B2B' }

export const fixtureLedger: LedgerRow[] = [
  {
    id: 'fx-1',
    client_id: 'fx-musafar',
    outcome_kind: 'metric',
    start_value: '300',
    start_note: 'pengikut Instagram',
    end_value: '22.000',
    end_note: 'pengikut Instagram',
    period: null,
    sort_order: 1,
    client: MUSAFAR,
  },
  {
    id: 'fx-2',
    client_id: 'fx-musafar',
    outcome_kind: 'metric',
    start_value: null,
    start_note: 'belum ada pipeline lead terukur',
    end_value: '500.000',
    end_note: 'biaya akuisisi per jemaah, di bawah',
    period: null,
    sort_order: 2,
    client: MUSAFAR,
  },
  {
    id: 'fx-3',
    client_id: 'fx-musafar',
    outcome_kind: 'milestone',
    start_value: null,
    start_note: 'belum ada kanal akuisisi',
    end_value: null,
    end_note: 'Sistem lead dan atribusi CTWA berjalan penuh',
    period: null,
    sort_order: 3,
    client: MUSAFAR,
  },
  {
    id: 'fx-4',
    client_id: 'fx-nuralive',
    outcome_kind: 'milestone',
    start_value: null,
    start_note: 'produk belum dapat diedarkan',
    end_value: null,
    end_note: 'Izin edar terbit dan sertifikasi halal selesai',
    period: null,
    sort_order: 4,
    client: NURALIVE,
  },
  {
    id: 'fx-5',
    client_id: 'fx-musaland',
    outcome_kind: 'milestone',
    start_value: null,
    start_note: 'identitas dan penawaran belum terbentuk',
    end_value: null,
    end_note: 'Positioning dan struktur layanan tersusun',
    period: null,
    sort_order: 5,
    client: MUSALAND,
  },
]

export const fixtureCaseStudies: CaseStudy[] = [
  {
    id: 'fx-cs-1',
    client_id: 'fx-musafar',
    slug: 'musafar',
    title: 'Membangun kepercayaan sebelum membangun permintaan',
    summary:
      'Umroh adalah pembelian sekali seumur hidup bagi sebagian besar orang. Kami menyusun ulang urutan kerjanya: bukti dulu, penawaran belakangan.',
    body: `Umroh bukan barang yang dibeli karena diskon. Nilainya besar, keputusannya melibatkan keluarga, dan konsekuensi salah pilih penyelenggara ditanggung seumur hidup. Karena itu iklan yang langsung menawarkan harga hampir selalu kalah oleh calon jemaah yang belum selesai bertanya-tanya.

## Yang kami kerjakan

**Konten sebagai bukti, bukan sebagai etalase.** Alih-alih memotret paket, kami mendokumentasikan hal-hal yang biasanya tidak diperlihatkan penyelenggara lain: proses pendampingan, kondisi penginapan apa adanya, dan pertanyaan sulit dari jemaah beserta jawabannya.

**Klik-ke-WhatsApp sebagai jalur utama.** Calon jemaah ingin bertanya sebelum mendaftar. Memaksa mereka melewati formulir pendaftaran memutus percakapan di titik paling menentukan. Iklan diarahkan langsung ke WhatsApp, lalu percakapan ditangani tim CS dengan alur yang sudah disepakati.

**Atribusi yang kami bangun sendiri.** Kami memasang penelusuran dari iklan, ke percakapan, sampai ke pendaftaran, sehingga setiap rupiah belanja iklan dapat ditelusuri ke jemaah yang benar-benar berangkat — bukan berhenti di jumlah pesan masuk.

## Yang berubah

Pipeline akuisisi berjalan dengan biaya per akuisisi yang terkendali dan akun Instagram tumbuh dari titik hampir nol menjadi kanal bukti yang berdiri sendiri.

> Angka pastinya sedang diverifikasi dan akan dicantumkan setelah dikonfirmasi.`,
    sort_order: 1,
    client: { ...MUSAFAR, one_liner: 'Penyelenggara umroh premium dengan pendampingan penuh, dari pendaftaran sampai kepulangan.' },
  },
  {
    id: 'fx-cs-2',
    client_id: 'fx-nuralive',
    slug: 'nuralive',
    title: 'Menyelesaikan perizinan sebelum menyalakan iklan',
    summary:
      'Rebranding dari Habi bukan sekadar ganti logo. Sebagian besar pekerjaannya ada di kepatuhan regulasi, dan itu yang menentukan apa yang boleh ditulis.',
    body: `Suplemen adalah kategori dengan batas klaim yang ketat. Satu kalimat khasiat yang tidak disetujui bukan revisi naskah, melainkan persoalan regulasi yang bisa menghentikan penjualan.

## Yang kami kerjakan

**Perizinan lebih dulu.** Izin edar dan sertifikasi halal diselesaikan sebelum materi promosi disusun, bukan sesudahnya. Urutan ini membuat tim kreatif tahu persis batas yang boleh mereka sentuh.

**Daftar klaim yang boleh dan tidak boleh.** Kami menyusun daftar tertulis berisi klaim yang diizinkan beserta dasarnya, dan klaim yang dilarang beserta alasannya. Daftar ini dipakai setiap kali naskah iklan ditulis.

**Struktur merek yang bertahan setelah rebranding.** Nama berubah, formulasi dirapikan, dan posisi produk disusun ulang agar tidak bergantung pada klaim yang tidak dapat dipertanggungjawabkan.

## Yang sedang berjalan

Persetujuan iklan melalui SIREKA masih menjadi penghambat aktif untuk penayangan berbayar. Selama proses itu berjalan, pekerjaan difokuskan pada kanal organik dan penyiapan materi yang sudah aman secara klaim.`,
    sort_order: 2,
    client: { ...NURALIVE, one_liner: 'Suplemen herbal yang diformulasikan ulang dari Habi, dengan izin edar dan sertifikasi halal.' },
  },
  {
    id: 'fx-cs-3',
    client_id: 'fx-musaland',
    slug: 'musaland',
    title: 'Menyusun penawaran sebelum mencari permintaan',
    summary:
      'Logistik B2B dimenangkan oleh keandalan, bukan oleh jangkauan iklan. Pekerjaan awalnya adalah memperjelas apa yang sebenarnya dijual.',
    body: `Musaland adalah yang paling muda di antara tiga merek yang kami tangani, dan kami menuliskannya apa adanya. Pada tahap ini pekerjaannya belum berupa akuisisi, melainkan penyusunan dasar.

## Yang kami kerjakan

**Memperjelas siapa yang dilayani.** Logistik antarpulau melayani banyak jenis pengirim dengan kebutuhan yang sangat berbeda. Menyempitkan sasaran ke pengirim rutin bervolume besar membuat penawaran dapat dijelaskan dalam satu kalimat.

**Menyusun struktur layanan dan alasan harganya.** Setiap komponen biaya didokumentasikan supaya tim penjualan dapat mempertahankan harga tanpa bergantung pada negosiasi perorangan.

## Yang belum

Belum ada capaian akuisisi yang layak diklaim di halaman ini. Bagian ini akan diperbarui ketika ada angka yang dapat diverifikasi.`,
    sort_order: 3,
    client: { ...MUSALAND, one_liner: 'Layanan logistik antarpulau untuk pelaku usaha yang mengirim rutin dalam volume besar.' },
  },
]

export const fixtureJobs: JobOpening[] = [
  {
    id: 'fx-job-1',
    slug: 'performance-marketer',
    title: 'Performance Marketer',
    employment_type: 'PKWT',
    location: 'Bekasi',
    work_arrangement: 'hybrid',
    week_one: `Minggu pertama kamu akan:

- Membaca akun iklan Musafar dan NurAlive, lalu menuliskan tiga hal yang menurutmu paling boros.
- Menyiapkan satu uji coba materi iklan baru berdasarkan sudut yang belum pernah kami coba.
- Duduk bersama tim CS untuk mendengar langsung keberatan yang paling sering muncul di WhatsApp.

Kamu tidak akan diminta membuat laporan mingguan yang tidak dibaca siapa pun.`,
    tools: ['Meta Ads Manager', 'Google Analytics', 'Kommo CRM', 'Spreadsheet'],
    salary_min: 7000000,
    salary_max: 11000000,
    salary_period: 'bulan',
    question_prompt:
      'Ceritakan satu kampanye yang kamu hentikan lebih cepat dari rencana. Apa yang membuatmu memutuskan berhenti?',
    sort_order: 1,
  },
  {
    id: 'fx-job-2',
    slug: 'copywriter-social-media',
    title: 'Copywriter / Social Media',
    employment_type: 'PKWT',
    location: 'Bekasi',
    work_arrangement: 'hybrid',
    week_one: `Minggu pertama kamu akan:

- Membaca daftar klaim yang boleh dan tidak boleh untuk NurAlive, lalu menulis lima naskah yang tetap menarik di dalam batas itu.
- Menulis ulang tiga naskah lama Musafar yang menurutmu terdengar seperti penyelenggara umroh lain.
- Ikut mendengarkan percakapan CS untuk menangkap cara calon jemaah bertanya.

Kami menulis dalam bahasa Indonesia yang rapi. Kemampuan menulis EYD dengan benar bukan nilai tambah, melainkan syarat.`,
    tools: ['Google Docs', 'Canva', 'Buffer'],
    salary_min: 5500000,
    salary_max: 8500000,
    salary_period: 'bulan',
    question_prompt: 'Kirim satu naskah iklan yang kamu tulis dan gagal. Menurutmu kenapa gagal?',
    sort_order: 2,
  },
]

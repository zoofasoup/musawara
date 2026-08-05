-- Musawara — Phase 1 seed.
--
-- IMPORTANT: every ledger figure below is seeded UNPUBLISHED and UNVERIFIED.
-- The figures in spec §6.2 were supplied as drafts and have not been confirmed
-- against source data. The `published_metric_must_be_verified` constraint on
-- ledger_entries will reject any attempt to publish them until someone sets
-- verified_at by hand. That is deliberate — see README, "Publishing figures".
--
-- Case study and services copy IS published, because it makes no numeric
-- claims. It still needs an editorial pass from the owner before launch.

-- ------------------------------------------------------------------ clients

insert into clients (name, slug, category, one_liner, sort_order) values
  (
    'Musafar',
    'musafar',
    'Travel Umroh Premium',
    'Penyelenggara umroh premium dengan pendampingan penuh, dari pendaftaran sampai kepulangan.',
    1
  ),
  (
    'NurAlive',
    'nuralive',
    'Suplemen Herbal',
    'Suplemen herbal yang diformulasikan ulang dari Habi, dengan izin edar dan sertifikasi halal.',
    2
  ),
  (
    'Musaland',
    'musaland',
    'Logistik B2B',
    'Layanan logistik antarpulau untuk pelaku usaha yang mengirim rutin dalam volume besar.',
    3
  );

-- ----------------------------------------------------------- ledger entries
--
-- Drafts. Unpublished and unverified until the owner confirms each figure.

insert into ledger_entries
  (client_id, outcome_kind, start_value, start_note, end_value, end_note, period, source_note, sort_order)
select id, 'metric', '300', 'pengikut Instagram', '22.000', 'pengikut Instagram', null,
       'Draf dari spec §6.2. Perlu konfirmasi angka akhir dan rentang periode.', 1
from clients where slug = 'musafar';

insert into ledger_entries
  (client_id, outcome_kind, start_value, start_note, end_value, end_note, period, source_note, sort_order)
select id, 'metric', null, 'belum ada pipeline lead terukur', '500.000', 'biaya akuisisi per jemaah, di bawah', null,
       'Draf dari spec §6.2. Perlu konfirmasi periode dan total belanja iklan yang menopang angka ini.', 2
from clients where slug = 'musafar';

insert into ledger_entries
  (client_id, outcome_kind, start_value, start_note, end_value, end_note, period, source_note, sort_order)
select id, 'milestone', null, 'produk belum dapat diedarkan', null,
       'Izin edar terbit dan sertifikasi halal selesai', null,
       'Perlu konfirmasi tanggal terbit dan lembaga penerbit (BPOM, BPJPH).', 3
from clients where slug = 'nuralive';

insert into ledger_entries
  (client_id, outcome_kind, start_value, start_note, end_value, end_note, period, source_note, sort_order)
select id, 'milestone', null, 'belum ada kanal akuisisi', null,
       'Sistem lead dan atribusi CTWA berjalan penuh',
       null,
       'Perlu konfirmasi kapan sistem mulai berjalan.', 4
from clients where slug = 'musafar';

insert into ledger_entries
  (client_id, outcome_kind, start_value, start_note, end_value, end_note, period, source_note, sort_order)
select id, 'milestone', null, 'identitas dan penawaran belum terbentuk', null,
       'Positioning dan struktur layanan tersusun', null,
       'Perlu konfirmasi capaian Musaland yang layak diklaim publik.', 5
from clients where slug = 'musaland';

-- ------------------------------------------------------------ case studies

insert into case_studies (client_id, slug, title, summary, body, is_published, sort_order)
select
  id,
  'musafar',
  'Membangun kepercayaan sebelum membangun permintaan',
  'Umroh adalah pembelian sekali seumur hidup bagi sebagian besar orang. Kami menyusun ulang urutan kerjanya: bukti dulu, penawaran belakangan.',
  $md$
Umroh bukan barang yang dibeli karena diskon. Nilainya besar, keputusannya
melibatkan keluarga, dan konsekuensi salah pilih penyelenggara ditanggung
seumur hidup. Karena itu iklan yang langsung menawarkan harga hampir selalu
kalah oleh calon jemaah yang belum selesai bertanya-tanya.

## Yang kami kerjakan

**Konten sebagai bukti, bukan sebagai etalase.** Alih-alih memotret paket,
kami mendokumentasikan hal-hal yang biasanya tidak diperlihatkan penyelenggara
lain: proses pendampingan, kondisi penginapan apa adanya, dan pertanyaan sulit
dari jemaah beserta jawabannya.

**Klik-ke-WhatsApp sebagai jalur utama.** Calon jemaah ingin bertanya sebelum
mendaftar. Memaksa mereka melewati formulir pendaftaran memutus percakapan di
titik paling menentukan. Iklan diarahkan langsung ke WhatsApp, lalu percakapan
ditangani tim CS dengan alur yang sudah disepakati.

**Atribusi yang kami bangun sendiri.** Kami memasang penelusuran dari iklan,
ke percakapan, sampai ke pendaftaran, sehingga setiap rupiah belanja iklan
dapat ditelusuri ke jemaah yang benar-benar berangkat — bukan berhenti di
jumlah pesan masuk.

## Yang berubah

Pipeline akuisisi berjalan dengan biaya per akuisisi yang terkendali dan
akun Instagram tumbuh dari titik hampir nol menjadi kanal bukti yang berdiri
sendiri.

> Angka pastinya sedang diverifikasi dan akan dicantumkan setelah dikonfirmasi.
  $md$,
  true,
  1
from clients where slug = 'musafar';

insert into case_studies (client_id, slug, title, summary, body, is_published, sort_order)
select
  id,
  'nuralive',
  'Menyelesaikan perizinan sebelum menyalakan iklan',
  'Rebranding dari Habi bukan sekadar ganti logo. Sebagian besar pekerjaannya ada di kepatuhan regulasi, dan itu yang menentukan apa yang boleh ditulis.',
  $md$
Suplemen adalah kategori dengan batas klaim yang ketat. Satu kalimat khasiat
yang tidak disetujui bukan revisi naskah, melainkan persoalan regulasi yang
bisa menghentikan penjualan.

## Yang kami kerjakan

**Perizinan lebih dulu.** Izin edar dan sertifikasi halal diselesaikan sebelum
materi promosi disusun, bukan sesudahnya. Urutan ini membuat tim kreatif tahu
persis batas yang boleh mereka sentuh.

**Daftar klaim yang boleh dan tidak boleh.** Kami menyusun daftar tertulis
berisi klaim yang diizinkan beserta dasarnya, dan klaim yang dilarang beserta
alasannya. Daftar ini dipakai setiap kali naskah iklan ditulis.

**Struktur merek yang bertahan setelah rebranding.** Nama berubah, formulasi
dirapikan, dan posisi produk disusun ulang agar tidak bergantung pada klaim
yang tidak dapat dipertanggungjawabkan.

## Yang sedang berjalan

Persetujuan iklan melalui SIREKA masih menjadi penghambat aktif untuk
penayangan berbayar. Selama proses itu berjalan, pekerjaan difokuskan pada
kanal organik dan penyiapan materi yang sudah aman secara klaim.
  $md$,
  true,
  2
from clients where slug = 'nuralive';

insert into case_studies (client_id, slug, title, summary, body, is_published, sort_order)
select
  id,
  'musaland',
  'Menyusun penawaran sebelum mencari permintaan',
  'Logistik B2B dimenangkan oleh keandalan, bukan oleh jangkauan iklan. Pekerjaan awalnya adalah memperjelas apa yang sebenarnya dijual.',
  $md$
Musaland adalah yang paling muda di antara tiga merek yang kami tangani, dan
kami menuliskannya apa adanya. Pada tahap ini pekerjaannya belum berupa
akuisisi, melainkan penyusunan dasar.

## Yang kami kerjakan

**Memperjelas siapa yang dilayani.** Logistik antarpulau melayani banyak jenis
pengirim dengan kebutuhan yang sangat berbeda. Menyempitkan sasaran ke pengirim
rutin bervolume besar membuat penawaran dapat dijelaskan dalam satu kalimat.

**Menyusun struktur layanan dan alasan harganya.** Setiap komponen biaya
didokumentasikan supaya tim penjualan dapat mempertahankan harga tanpa
bergantung pada negosiasi perorangan.

## Yang belum

Belum ada capaian akuisisi yang layak diklaim di halaman ini. Bagian ini akan
diperbarui ketika ada angka yang dapat diverifikasi.
  $md$,
  true,
  3
from clients where slug = 'musaland';

-- ------------------------------------------------------------ job openings
--
-- Unpublished: salary ranges are placeholders and the constraint requires a
-- real range before a role can go live. Replace the numbers, then publish.

insert into job_openings
  (slug, title, employment_type, location, work_arrangement, week_one, tools,
   salary_min, salary_max, question_prompt, sort_order)
values
  (
    'performance-marketer',
    'Performance Marketer',
    'PKWT',
    'Bekasi',
    'hybrid',
    $md$
Minggu pertama kamu akan:

- Membaca akun iklan Musafar dan NurAlive, lalu menuliskan tiga hal yang
  menurutmu paling boros.
- Menyiapkan satu uji coba materi iklan baru berdasarkan sudut yang belum
  pernah kami coba.
- Duduk bersama tim CS untuk mendengar langsung keberatan yang paling sering
  muncul di WhatsApp.

Kamu tidak akan diminta membuat laporan mingguan yang tidak dibaca siapa pun.
    $md$,
    array['Meta Ads Manager', 'Google Analytics', 'Kommo CRM', 'Spreadsheet'],
    null, null,
    'Ceritakan satu kampanye yang kamu hentikan lebih cepat dari rencana. Apa yang membuatmu memutuskan berhenti?',
    1
  ),
  (
    'copywriter-social-media',
    'Copywriter / Social Media',
    'PKWT',
    'Bekasi',
    'hybrid',
    $md$
Minggu pertama kamu akan:

- Membaca daftar klaim yang boleh dan tidak boleh untuk NurAlive, lalu menulis
  lima naskah yang tetap menarik di dalam batas itu.
- Menulis ulang tiga naskah lama Musafar yang menurutmu terdengar seperti
  penyelenggara umroh lain.
- Ikut mendengarkan percakapan CS untuk menangkap cara calon jemaah bertanya.

Kami menulis dalam bahasa Indonesia yang rapi. Kemampuan menulis EYD dengan
benar bukan nilai tambah, melainkan syarat.
    $md$,
    array['Google Docs', 'Canva', 'Buffer'],
    null, null,
    'Kirim satu naskah iklan yang kamu tulis dan gagal. Menurutmu kenapa gagal?',
    2
  );

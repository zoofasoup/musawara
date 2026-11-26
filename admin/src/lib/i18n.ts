// Two languages, English and Indonesian. The source text in the code IS the English key, so a string that has no entry here simply
// stays English (nothing breaks while the dictionary grows). Shared components (PageHeader, Bento, Btn, Pill, Callout, FormField,
// Segmented, DataTable, Empty, ...) translate their string props, so pages get translated by adding a line here, not by touching them.
// Metric names marketers use in English (Spend, Leads, CPL, CPA, ROAS, CTR) are deliberately left alone.

export type Lang = "en" | "id";
export const LANGS: Lang[] = ["en", "id"];

export const ID: Record<string, string> = {
  // navigation
  Work: "Kerja", Tools: "Alat", Overview: "Ringkasan", Clients: "Klien", Client: "Klien", Approvals: "Persetujuan", Planning: "Perencanaan", Board: "Papan",
  Spend: "Biaya iklan", Settings: "Pengaturan", Profile: "Profil", "Sign out": "Keluar", Menu: "Menu", Account: "Akun", More: "Lainnya", Ads: "Iklan", Sales: "Penjualan",
  Alerts: "Peringatan", Assets: "Aset", "Brand knowledge": "Pengetahuan merek", Organic: "Organik", Report: "Laporan", Creatives: "Kreatif",
  "Connect Instagram": "Hubungkan Instagram", "Connect Shopee": "Hubungkan Shopee", "Not synced yet": "Belum disinkron", Updated: "Diperbarui", account: "akun", accounts: "akun",
  // common actions
  Save: "Simpan", Cancel: "Batal", Delete: "Hapus", Add: "Tambah", Edit: "Ubah", Close: "Tutup", Open: "Buka", "Try again": "Coba lagi", Review: "Tinjau", Approve: "Setujui",
  "Request changes": "Minta perubahan", "Sync now": "Sinkron sekarang", "Syncing…": "Menyinkron…", Search: "Cari", All: "Semua", Dismiss: "Tutup", Copy: "Salin", Copied: "Tersalin",
  Next: "Lanjut", Back: "Kembali", Retry: "Ulangi", Send: "Kirim", Update: "Terapkan", Apply: "Terapkan", Today: "Hari ini", Yes: "Ya", No: "Tidak",
  // states
  "Something went wrong": "Terjadi kesalahan", "Nothing here yet": "Belum ada apa-apa", "No clients yet": "Belum ada klien", "Add your first client in Settings.": "Tambahkan klien pertamamu di Pengaturan.",
  "No clients match.": "Tidak ada klien yang cocok.", "No data in this date range": "Tidak ada data di rentang tanggal ini", "No alerts": "Tidak ada peringatan", "Nothing open": "Tidak ada yang terbuka",
  "Numbers appear after the first sync.": "Angka muncul setelah sinkron pertama.", "Anomaly detection runs after every sync.": "Deteksi anomali berjalan setiap selesai sinkron.",
  // overview and clients
  "How each client's ads are doing this month, and what needs attention.": "Performa iklan tiap klien bulan ini, dan apa yang perlu diperhatikan.",
  "Open a client to see its ads, sales, content and files in one place.": "Buka klien untuk melihat iklan, penjualan, konten, dan filenya di satu tempat.",
  "Add a client in Settings": "Tambah klien di Pengaturan", "Spend overview": "Ringkasan spend", "All clients, this month": "Semua klien, bulan ini", "On target": "Sesuai target",
  "Clients at or under their CPA target": "Klien yang CPA-nya di bawah atau sama dengan target", "Spend share": "Porsi spend", "Of this month's total": "Dari total bulan ini",
  "Latest alerts": "Peringatan terbaru", "All clients": "Semua klien", "Sync health": "Kesehatan sinkron", "Last successful sync per ad account": "Sinkron berhasil terakhir per akun iklan",
  "Needs attention": "Perlu perhatian", "Open alerts": "Peringatan terbuka", "This month": "Bulan ini", "Need attention": "Perlu perhatian", "No target": "Tanpa target",
  "No ad accounts connected yet.": "Belum ada akun iklan yang terhubung.",
  // client dashboard
  "Key numbers": "Angka utama", "Daily trend": "Tren harian", "Weekly trend": "Tren mingguan", "Monthly trend": "Tren bulanan", "Spend, leads and purchases": "Spend, leads, dan pembelian",
  "Top creatives by spend": "Kreatif teratas menurut spend", "All creatives": "Semua kreatif", Campaigns: "Kampanye", "Budget pacing": "Laju anggaran", "Winners and boncos": "Yang menang dan yang boncos", "Compare": "Bandingkan", "Previous period": "Periode sebelumnya", "Previous month": "Bulan sebelumnya", "Previous year": "Tahun sebelumnya", Off: "Mati",
  "Custom range…": "Rentang kustom…",
  // date presets
  Yesterday: "Kemarin", "Today and yesterday": "Hari ini dan kemarin", "Last 3 days": "3 hari terakhir", "Last 7 days": "7 hari terakhir", "Last 14 days": "14 hari terakhir", "Last 28 days": "28 hari terakhir",
  "Last 30 days": "30 hari terakhir", "This week": "Minggu ini", "Last week": "Minggu lalu", "Last month": "Bulan lalu", Maximum: "Maksimum", Custom: "Kustom",
  // account and sign in
  "Your account on Musawara.": "Akunmu di Musawara.", "Sign in": "Masuk", "Signing in…": "Masuk…", Email: "Email", Password: "Kata sandi", "Create your account": "Buat akunmu", "Create account": "Buat akun",
  "Creating…": "Membuat…", "Your name": "Namamu", "Access is by invitation from Musawara Creative.": "Akses hanya lewat undangan dari Musawara Creative.",
  "Password (8+ characters)": "Kata sandi (8+ karakter)",
  // CRM copy
  "Your account.": "Akunmu.", "Invite your team.": "Undang timmu.", "Welcome back.": "Selamat datang kembali.", "Invite your teammates.": "Undang rekan timmu.",
  "No WhatsApp number is available to you yet. Please tell an Owner.": "Belum ada nomor WhatsApp yang bisa kamu pakai. Beri tahu Owner.",
  // approvals, assets, planning (frequent)
  "New request": "Permintaan baru", "No approval requests yet": "Belum ada permintaan persetujuan", Waiting: "Menunggu", "Changes requested": "Perubahan diminta", Approved: "Disetujui",
  "All statuses": "Semua status", "Asset library": "Pustaka aset", "Add asset": "Tambah aset", "Edit asset": "Ubah aset", Title: "Judul", Type: "Tipe", Notes: "Catatan", "Google Drive link": "Tautan Google Drive",
  Calendar: "Kalender", Month: "Bulan", Week: "Minggu", Draft: "Draf", Scheduled: "Terjadwal", Published: "Terbit", Failed: "Gagal",
  Connected: "Terhubung", "Not connected": "Belum terhubung", Online: "Aktif", "In progress": "Berjalan", Winner: "Menang", Weak: "Lemah", Winning: "Menang", "On par": "Sebanding", Watch: "Awasi", "No leads": "Tanpa lead",
  Language: "Bahasa", "Switch language": "Ganti bahasa",
};

export const DICT: Record<Lang, Record<string, string>> = { en: {}, id: ID };

/** The text in the chosen language, or the original when there is no translation. */
export function translate(lang: Lang, text: string): string {
  return lang === "en" ? text : DICT[lang][text] ?? text;
}

export const FLAG: Record<Lang, { emoji: string; code: string; name: string }> = {
  en: { emoji: "🇬🇧", code: "EN", name: "English" },
  id: { emoji: "🇮🇩", code: "ID", name: "Bahasa Indonesia" },
};

/** First visit: Indonesian browsers start in Indonesian, everything else in English. */
export const initialLang = (stored: string | null, browser: string | undefined): Lang =>
  stored === "id" || stored === "en" ? stored : (browser ?? "").toLowerCase().startsWith("id") ? "id" : "en";

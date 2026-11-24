// Ready-made custom fields for the brands that need more than the general CRM: one click on a number adds the ones it lacks
// (matched by label, so pressing it twice changes nothing). `required` = must be filled before a card can be moved to Won.
// Labels match the columns of the Kommo exports, so importing them fills the fields without renaming anything.

export type PresetField = { label: string; type: "text" | "number" | "date" | "select" | "checkbox" | "url"; options?: string[]; required?: boolean };
export type Preset = { id: string; name: string; description: string; fields: PresetField[] };

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export const PRESETS: Preset[] = [
  {
    id: "musafar",
    name: "Musafar Tour (umrah)",
    description: "Package, departure month and year, who travels, payment and why a lead was lost.",
    fields: [
      { label: "Paket Umroh", type: "text", required: true },
      { label: "Bulan", type: "select", options: MONTHS, required: true },
      { label: "Tahun", type: "number", required: true },
      { label: "Jumlah Jamaah", type: "number", required: true },
      { label: "Dewasa", type: "number" },
      { label: "Anak", type: "number" },
      { label: "Lansia", type: "number" },
      { label: "Infant", type: "number" },
      { label: "Pembayaran", type: "select", options: ["Belum bayar", "DP", "Cicilan", "Lunas"] },
      { label: "Pernah Umroh", type: "checkbox" },
      { label: "Domisili", type: "text" },
      { label: "Umur", type: "number" },
      { label: "Preferensi", type: "text" },
      { label: "Alasan gagal", type: "text" },
      { label: "Tautan Zoom", type: "url" },
    ],
  },
  {
    id: "nuralive",
    name: "NurAlive (event guests)",
    description: "Guest or KOL, attendance, +1, seat and the person's Instagram.",
    fields: [
      { label: "Kategori", type: "select", options: ["Guest", "KOL"], required: true },
      { label: "Kehadiran", type: "select", options: ["Belum konfirmasi", "Hadir", "Tidak hadir"], required: true },
      { label: "Jumlah +1", type: "number" },
      { label: "Nomor kursi", type: "text" },
      { label: "Instagram", type: "text" },
      { label: "Jumlah followers", type: "number" },
    ],
  },
];

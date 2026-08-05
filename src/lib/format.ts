const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

/** `Rp 7.000.000` — no decimals, Indonesian separators. */
export function formatRupiah(value: number): string {
  // Intl renders IDR as "Rp7.000.000"; the space reads better in body copy.
  return rupiah.format(value).replace(/^Rp\s?/, 'Rp ')
}

export function formatSalaryRange(
  min: number | null,
  max: number | null,
  period: string,
): string | null {
  if (min == null || max == null) return null
  if (min === max) return `${formatRupiah(min)} / ${period}`
  return `${formatRupiah(min)} – ${formatRupiah(max)} / ${period}`
}

const ARRANGEMENT_LABEL: Record<string, string> = {
  onsite: 'Kerja di kantor',
  hybrid: 'Hibrida',
  remote: 'Jarak jauh',
}

export function formatArrangement(value: string): string {
  return ARRANGEMENT_LABEL[value] ?? value
}

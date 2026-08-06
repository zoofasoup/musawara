/**
 * Company facts used across the site.
 *
 * ⚠ UNCONFIRMED — the office address and phone number below are placeholders.
 * They are written to be obviously fake rather than plausibly wrong, so that
 * shipping them by accident is visible rather than silent. Replace every field
 * marked NEEDS CONFIRMATION before pointing a domain at this site.
 */
export const COMPANY = {
  name: 'Musawara Creative',
  legalName: 'PT Musacreativa Digital Nusantara',
  group: 'MUSA Group',

  // NEEDS CONFIRMATION — full street address, district, postcode.
  addressLines: ['Bekasi, Jawa Barat', 'Alamat lengkap menyusul'],

  // NEEDS CONFIRMATION — official contact address. Domain is musawara.id per
  // the owner; note the Google Workspace account is on musawaracreative.com,
  // so this may need to be an address there instead.
  email: 'halo@musawara.id',

  // NEEDS CONFIRMATION — company WhatsApp number in international format.
  whatsappNumber: '',
  get whatsappUrl(): string {
    return this.whatsappNumber
      ? `https://wa.me/${this.whatsappNumber}`
      : 'https://wa.me/'
  },

  /** True once every NEEDS CONFIRMATION field above has been filled in. */
  get contactDetailsConfirmed(): boolean {
    return Boolean(this.whatsappNumber) && this.addressLines.length > 2
  },
} as const

/**
 * Company facts used across the site.
 *
 * Email and WhatsApp are confirmed by the owner. The street address is still
 * outstanding and is marked below.
 */
export const COMPANY = {
  name: 'Musawara Creative',
  legalName: 'PT Musacreativa Digital Nusantara',
  group: 'MUSA Group',

  // NEEDS CONFIRMATION — full street address, district, postcode.
  addressLines: ['Bekasi, Jawa Barat'],

  email: 'admin@musawara.id',

  /** International format, digits only — what wa.me expects. */
  whatsappNumber: '6285117321138',
  whatsappDisplay: '+62 851-1732-1138',
  get whatsappUrl(): string {
    return `https://wa.me/${this.whatsappNumber}`
  },
} as const

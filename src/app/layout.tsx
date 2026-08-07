import type { Metadata } from 'next'
import { TASA_Explorer, TASA_Orbiter } from 'next/font/google'

import './globals.css'

// Brand direction permits these two families and nothing else.
// Both are variable across 400–800; neither has an italic.

// Display, headings, and figures.
const orbiter = TASA_Orbiter({
  subsets: ['latin'],
  variable: '--font-orbiter',
  display: 'swap',
})

// Body copy and UI labels.
const explorer = TASA_Explorer({
  subsets: ['latin'],
  variable: '--font-explorer',
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Musawara Creative — agensi yang menjalankan mereknya sendiri',
    template: '%s — Musawara Creative',
  },
  description:
    'Musawara Creative menangani strategi merek, performance marketing, dan produksi kreatif untuk merek-merek MUSA Group. Kami menjalankan merek sendiri, bukan hanya mempresentasikannya.',
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'Musawara Creative',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="id"
      className={`${orbiter.variable} ${explorer.variable}`}
    >
      {/* Header, nav, and footer live in the (site) route group, not here —
          the holding page at / has none of them. */}
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  )
}

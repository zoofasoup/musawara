import { Figure } from './Figure'
import type { LedgerRow } from '@/lib/types'

/**
 * The home page hero: a typeset table of brands and outcomes.
 *
 * Not cards, not a gradient, no animated counters. Hairline rules and one
 * staggered reveal on load (globals.css), disabled under prefers-reduced-motion.
 *
 * Renders as a real <table> on wide viewports and as stacked definition blocks
 * below `md`, because a five-column table at 375px is unreadable at any size
 * that keeps the figures legible.
 */

function Value({ value, note }: { value: string | null; note: string | null }) {
  if (!value && !note) return <span className="text-paper/40">—</span>
  return (
    <>
      {value ? <Figure className="text-[1.35em]">{value}</Figure> : null}
      {note ? (
        <span className={value ? 'ml-1.5 text-paper/70' : 'text-paper/70'}>
          {note}
        </span>
      ) : null}
    </>
  )
}

/**
 * A brand's name is printed once per group, not once per row. Repeating
 * "Musafar / Travel Umroh Premium" down three consecutive rows reads as a
 * spreadsheet dump; printing it once reads as a ledger.
 */
function isGroupStart(rows: LedgerRow[], i: number): boolean {
  return i === 0 || rows[i - 1].client.slug !== rows[i].client.slug
}

export function Ledger({ rows }: { rows: LedgerRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="max-w-[46ch] text-paper/60">
        Angka-angka sedang diverifikasi dan akan dicantumkan di sini setelah
        dikonfirmasi.
      </p>
    )
  }

  return (
    <>
      {/* Wide: a real table. */}
      <table className="hidden w-full border-collapse text-left md:table">
        <caption className="sr-only">
          Merek yang kami tangani beserta capaiannya
        </caption>
        <thead>
          <tr className="u-label text-paper/45">
            <th scope="col" className="w-[18%] pb-3 font-semibold">
              Merek
            </th>
            <th scope="col" className="w-[19%] pb-3 font-semibold">
              Kategori
            </th>
            <th scope="col" className="w-[24%] pb-3 font-semibold">
              Titik awal
            </th>
            <th scope="col" className="w-[26%] pb-3 font-semibold">
              Posisi sekarang
            </th>
            <th scope="col" className="w-[13%] pb-3 font-semibold">
              Periode
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const starts = isGroupStart(rows, i)
            return (
              <tr
                key={row.id}
                className={`ledger-row align-baseline ${starts ? 'border-t border-rule' : ''}`}
                style={{ '--row': i } as React.CSSProperties}
              >
                <th
                  scope="row"
                  className={`pr-4 font-semibold ${starts ? 'pb-4 pt-5' : 'pb-4'}`}
                >
                  {starts ? row.client.name : <span className="sr-only">{row.client.name}</span>}
                </th>
                <td className={`pr-4 text-small text-paper/60 ${starts ? 'pb-4 pt-5' : 'pb-4'}`}>
                  {starts ? row.client.category : null}
                </td>
                <td className={`pr-4 text-small ${starts ? 'pb-4 pt-5' : 'pb-4'}`}>
                  <Value value={row.start_value} note={row.start_note} />
                </td>
                <td className={`pr-4 ${starts ? 'pb-4 pt-5' : 'pb-4'}`}>
                  <Value value={row.end_value} note={row.end_note} />
                </td>
                <td className={`u-label text-paper/45 ${starts ? 'pb-4 pt-5' : 'pb-4'}`}>
                  {row.period ?? <span aria-label="periode belum dikonfirmasi">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Narrow: stacked, same content, same order. */}
      <dl className="md:hidden">
        {rows.map((row, i) => {
          const starts = isGroupStart(rows, i)
          return (
            <div
              key={row.id}
              className={`ledger-row ${starts ? 'border-t border-rule pt-5' : 'pt-4'} pb-1`}
              style={{ '--row': i } as React.CSSProperties}
            >
              {starts ? (
                <dt className="mb-3 flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold">{row.client.name}</span>
                  <span className="u-label text-paper/45">{row.client.category}</span>
                </dt>
              ) : (
                <dt className="sr-only">{row.client.name}</dt>
              )}
              <dd className="space-y-1.5 text-small">
                <div>
                  <span className="u-label mr-2 text-paper/45">Awal</span>
                  <Value value={row.start_value} note={row.start_note} />
                </div>
                <div>
                  <span className="u-label mr-2 text-paper/45">Kini</span>
                  <Value value={row.end_value} note={row.end_note} />
                </div>
                {row.period ? (
                  <div className="u-label pt-1 text-paper/45">{row.period}</div>
                ) : null}
              </dd>
            </div>
          )
        })}
      </dl>
    </>
  )
}

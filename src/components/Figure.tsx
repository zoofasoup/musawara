/**
 * A numeral.
 *
 * This is the ONLY component permitted to render the figure accent colour.
 * `.figure` reads --figure-color, which resolves to ink on the paper ground and
 * to brand lime inside .u-inverted. See the comment block in globals.css for
 * why lime is illegal on paper.
 *
 * Deliberately has no colour prop. If you want the accent somewhere else, the
 * answer is no — see spec §6.3.
 */
export function Figure({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <span className={`figure ${className}`}>{children}</span>
}

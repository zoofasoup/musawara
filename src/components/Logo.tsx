import Image from 'next/image'

/** Intrinsic dimensions of the official mark artwork. */
const MARK_W = 1204
const MARK_H = 1397

const SRC = {
  purple: '/logo/mark-purple.png',
  light: '/logo/mark-light.png',
  dark: '/logo/mark-dark.png',
} as const

export type LogoVariant = keyof typeof SRC

/**
 * The Musawara mark. Official artwork, not a redraw.
 *
 * Source files are PNG because that is what the brand folder contains; if an
 * SVG is exported later, swap the paths and drop the width/height props.
 */
export function Logo({
  variant = 'purple',
  height = 28,
  className = '',
  priority = false,
}: {
  variant?: LogoVariant
  height?: number
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src={SRC[variant]}
      alt=""
      aria-hidden="true"
      width={Math.round((MARK_W / MARK_H) * height)}
      height={height}
      className={className}
      priority={priority}
    />
  )
}

/** Mark plus wordmark, used in the header and footer. */
export function Wordmark({
  variant = 'purple',
  height = 26,
  className = '',
  priority = false,
}: {
  variant?: LogoVariant
  height?: number
  className?: string
  priority?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Logo variant={variant} height={height} priority={priority} />
      <span className="u-display text-[1.0625rem] leading-none">
        Musawara
      </span>
    </span>
  )
}

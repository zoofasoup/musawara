import type { ReactNode } from 'react'

/** Single source of truth for page gutters and measure. */
export function Container({
  children,
  className = '',
  wide = false,
}: {
  children: ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <div
      className={`mx-auto w-full px-5 sm:px-8 ${wide ? 'max-w-[84rem]' : 'max-w-[68rem]'} ${className}`}
    >
      {children}
    </div>
  )
}

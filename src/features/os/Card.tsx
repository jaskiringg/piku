import type { ReactNode } from 'react'

// Glassmorphic dashboard card. Title + optional action in the header.
export function Card({ title, action, children, className = '', bodyClass = '' }: {
  title?: string
  action?: ReactNode
  children?: ReactNode
  className?: string
  bodyClass?: string
}) {
  return (
    <div className={`relative rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.015] backdrop-blur-xl border border-white/10 ring-1 ring-inset ring-white/[0.04] shadow-[0_14px_50px_-18px_rgba(0,0,0,0.8)] ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          {title ? <h3 className="text-[13px] font-semibold tracking-tight text-white/85">{title}</h3> : <span />}
          {action}
        </div>
      )}
      <div className={`px-4 pb-4 ${title ? '' : 'pt-4'} ${bodyClass}`}>{children}</div>
    </div>
  )
}

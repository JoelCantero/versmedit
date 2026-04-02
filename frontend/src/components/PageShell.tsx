import { ReactNode } from 'react'
import { cn } from '../lib/utils'

type PageShellProps = {
  children: ReactNode
  className?: string
}

export default function PageShell({ children, className }: PageShellProps) {
  return (
    <main className={cn('mx-auto max-w-3xl px-6 py-28 lg:px-8', className)}>
      {children}
    </main>
  )
}

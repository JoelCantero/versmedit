import Button from '../components/Button'
import PageShell from '../components/PageShell'

type NotFoundProps = {
  onNavigateHome: () => void
  onNavigateContact: () => void
}

export default function NotFound({ onNavigateHome, onNavigateContact }: NotFoundProps) {
  return (
    <PageShell>
      <div className="text-center">
        <p className="text-base font-semibold text-primary">404</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight text-balance text-foreground sm:text-7xl">
          Page not found
        </h1>
        <p className="mt-6 text-lg font-medium text-pretty text-muted-foreground sm:text-xl/8">
          Sorry, we couldn't find the page you're looking for.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Button onClick={onNavigateHome}>Go back home</Button>
          <button onClick={onNavigateContact} className="cursor-pointer text-sm font-semibold text-foreground">
            Contact support <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </div>
    </PageShell>
  )
}

export default function Contact() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-28 lg:px-8">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold text-foreground">Contact</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Have questions or feedback? Reach out at{' '}
          <a href="mailto:hello@versmedit.com" className="font-medium text-primary hover:text-primary/80">
            hello@versmedit.com
          </a>
        </p>
      </div>
    </main>
  )
}

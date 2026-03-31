const faqs = [
  {
    question: 'How does the memorization system work?',
    answer:
      'VerseMedit uses the Leitner spaced-repetition method. Each verse starts at level 1 and moves up when you recall it correctly. If you miss it, the verse goes back to level 1.',
  },
  {
    question: 'How many levels are there?',
    answer:
      'There are 7 levels. Once a verse reaches level 7 and you recall it correctly, it is marked as mastered.',
  },
  {
    question: 'When are verses due for review?',
    answer:
      'Each level has a longer review interval. Level 1 is reviewed daily, while higher levels are spaced further apart.',
  },
]

export default function Faq() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-28 lg:px-8">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold text-foreground">Frequently asked questions</h1>
        <dl className="mt-6 space-y-6">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="text-sm font-medium text-foreground">{faq.question}</dt>
              <dd className="mt-2 text-sm text-muted-foreground">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  )
}

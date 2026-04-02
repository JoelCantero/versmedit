import Accordion from '../components/Accordion'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'

const faqs = [
  {
    title: 'How does daily learning work?',
    content:
      'Every day, the system selects cards from your box based on the Leitner schedule. The goal is to review cards at optimal intervals for better retention.',
  },
  {
    title: 'What happens when I know a verse?',
    content: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          If you <strong className="text-foreground">know the verse</strong> and do not make any mistake, the verse
          moves to the next level.
        </li>
        <li>
          If you <strong className="text-foreground">don't know the verse</strong> or make mistakes, the verse returns
          to Level 1 for more frequent review.
        </li>
      </ul>
    ),
  },
  {
    title: 'What if I forget a verse while studying?',
    content:
      "No worries! If you forget a verse, just return it to the first level and start again from the beginning. Repetition helps you hide God's Word in your heart. The more you practice, the stronger and more natural the verse becomes in your memory.",
  },
  {
    title: 'How often should I study my verses?',
    content:
      "When memorizing Scripture with the Leitner system, it's important to follow your review schedule consistently. Some verses will appear daily, while others will come up weekly or less often as you progress. Trust the process—each verse is reviewed at the right time to help you remember it long-term.",
  },
  {
    title: "Why don't I have any verses to study today?",
    content:
      "Verses appear for review based on your Leitner schedule. The higher a verse's level, the less often it needs to be reviewed. If no verses show up today, it simply means you're on track—nothing is due yet. Keep going tomorrow!",
  },
  {
    title: 'How often are verses available for study?',
    content: (
      <div className="space-y-3">
        <p>Each verse follows its own individual schedule based on its level:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Level 1 → 2</strong>: same day (immediately)
          </li>
          <li>
            <strong className="text-foreground">Level 2 → 3</strong>: after 2 days
          </li>
          <li>
            <strong className="text-foreground">Level 3 → 4</strong>: after 3 days
          </li>
          <li>
            <strong className="text-foreground">Level 4 → 5</strong>: after 7 days
          </li>
          <li>
            <strong className="text-foreground">Level 5 → 6</strong>: after 15 days
          </li>
          <li>
            <strong className="text-foreground">Level 6 → 7</strong>: after 31 days
          </li>
          <li>
            <strong className="text-foreground">Level 7 → Mastered</strong>: after 61 days
          </li>
        </ul>
        <p>
          This personalized schedule ensures that each verse is reviewed at the optimal time, helping you retain it more
          effectively and store it in your heart long-term.
        </p>
      </div>
    ),
  },
  {
    title: 'What happens if I miss one or two days?',
    content:
      "Each verse follows its own individual schedule, so there's no strict \"24-hour window\" you need to worry about. If you miss a day or two of practice, your verses will not disappear or reset. They will simply remain due, and you can continue your memorization whenever you return. This way, your progress stays intact—even if you skip a couple of days.",
  },
  {
    title: 'How long does it usually take to memorize a verse from Level 1 to Mastered?',
    content:
      'If you consistently recall a verse correctly, it will progress through all levels in about 120 days — roughly four months — before reaching the Mastered stage.',
  },
  {
    title: 'Can I study mastered verses again?',
    content: (
      <p>
        Yes, you can review your mastered verses. To do this, select the mastered verses and tap the{' '}
        <strong className="text-foreground">Study Again</strong> button. They will return to Level 1 and begin the
        memorization process from the beginning.
      </p>
    ),
  },
]

export default function Faq() {
  return (
    <PageShell>
      <PageHeader
        title="Frequently asked questions"
        description="Everything you need to know about VerseMedit."
      />
      <div className="mt-10">
        <Accordion items={faqs} />
      </div>
    </PageShell>
  )
}

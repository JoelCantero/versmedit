import Accordion from '../components/Accordion'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import { useTranslation } from '../i18n/LanguageContext'
import type { TranslationKey } from '../i18n/translations/en'

type FaqItem = {
  titleKey: TranslationKey
  contentKey?: TranslationKey
  contentJsx?: (t: (key: TranslationKey) => string) => React.ReactNode
}

const faqItems: FaqItem[] = [
  { titleKey: 'faq.q1.title', contentKey: 'faq.q1.content' },
  {
    titleKey: 'faq.q2.title',
    contentJsx: (t) => (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          If you <strong className="text-foreground">{t('faq.q2.title') ? 'know the verse' : ''}</strong> and do not make any mistake, the verse
          moves to the next level.
        </li>
        <li>
          If you <strong className="text-foreground">don't know the verse</strong> or make mistakes, the verse returns
          to Level 1 for more frequent review.
        </li>
      </ul>
    ),
  },
  { titleKey: 'faq.q3.title', contentKey: 'faq.q3.content' },
  { titleKey: 'faq.q4.title', contentKey: 'faq.q4.content' },
  { titleKey: 'faq.q5.title', contentKey: 'faq.q5.content' },
  {
    titleKey: 'faq.q6.title',
    contentJsx: () => (
      <div className="space-y-3">
        <p>Each verse follows its own individual schedule based on its level:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-foreground">Level 1 → 2</strong>: same day (immediately)</li>
          <li><strong className="text-foreground">Level 2 → 3</strong>: after 2 days</li>
          <li><strong className="text-foreground">Level 3 → 4</strong>: after 3 days</li>
          <li><strong className="text-foreground">Level 4 → 5</strong>: after 7 days</li>
          <li><strong className="text-foreground">Level 5 → 6</strong>: after 15 days</li>
          <li><strong className="text-foreground">Level 6 → 7</strong>: after 31 days</li>
          <li><strong className="text-foreground">Level 7 → Mastered</strong>: after 61 days</li>
        </ul>
        <p>
          This personalized schedule ensures that each verse is reviewed at the optimal time, helping you retain it more
          effectively and store it in your heart long-term.
        </p>
      </div>
    ),
  },
  { titleKey: 'faq.q7.title', contentKey: 'faq.q7.content' },
  { titleKey: 'faq.q8.title', contentKey: 'faq.q8.content' },
  {
    titleKey: 'faq.q9.title',
    contentJsx: () => (
      <p>
        Yes, you can review your mastered verses. To do this, select the mastered verses and tap the{' '}
        <strong className="text-foreground">Study Again</strong> button. They will return to Level 1 and begin the
        memorization process from the beginning.
      </p>
    ),
  },
]

export default function Faq() {
  const { t } = useTranslation()

  const faqs = faqItems.map((item) => ({
    title: t(item.titleKey),
    content: item.contentKey ? t(item.contentKey) : item.contentJsx!(t),
  }))

  return (
    <PageShell>
      <PageHeader
        title={t('faq.title')}
        description={t('faq.description')}
      />
      <div className="mt-10">
        <Accordion items={faqs} />
      </div>
    </PageShell>
  )
}

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
          {t('faq.q2.ifYou')} <strong className="text-foreground">{t('faq.q2.know')}</strong> {t('faq.q2.knowDesc')}
        </li>
        <li>
          {t('faq.q2.ifYou')} <strong className="text-foreground">{t('faq.q2.dontKnow')}</strong> {t('faq.q2.dontKnowDesc')}
        </li>
      </ul>
    ),
  },
  { titleKey: 'faq.q3.title', contentKey: 'faq.q3.content' },
  { titleKey: 'faq.q4.title', contentKey: 'faq.q4.content' },
  { titleKey: 'faq.q5.title', contentKey: 'faq.q5.content' },
  {
    titleKey: 'faq.q6.title',
    contentJsx: (t) => (
      <div className="space-y-3">
        <p>{t('faq.q6.intro')}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-foreground">Level 1 → 2</strong>: {t('faq.q6.l1')}</li>
          <li><strong className="text-foreground">Level 2 → 3</strong>: {t('faq.q6.l2')}</li>
          <li><strong className="text-foreground">Level 3 → 4</strong>: {t('faq.q6.l3')}</li>
          <li><strong className="text-foreground">Level 4 → 5</strong>: {t('faq.q6.l4')}</li>
          <li><strong className="text-foreground">Level 5 → 6</strong>: {t('faq.q6.l5')}</li>
          <li><strong className="text-foreground">Level 6 → 7</strong>: {t('faq.q6.l6')}</li>
          <li><strong className="text-foreground">Level 7 → Mastered</strong>: {t('faq.q6.l7')}</li>
        </ul>
        <p>{t('faq.q6.outro')}</p>
      </div>
    ),
  },
  { titleKey: 'faq.q7.title', contentKey: 'faq.q7.content' },
  { titleKey: 'faq.q8.title', contentKey: 'faq.q8.content' },
  {
    titleKey: 'faq.q9.title',
    contentJsx: (t) => (
      <p>
        {t('faq.q9.content')}{' '}
        <strong className="text-foreground">{t('faq.q9.studyAgain')}</strong> {t('faq.q9.contentEnd')}
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

import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import { useTranslation } from '../i18n/LanguageContext'

export default function AboutMe() {
  const { t } = useTranslation()

  return (
    <PageShell>
      <PageHeader
        title={t('aboutMe.title')}
        description={t('aboutMe.description')}
      />
    </PageShell>
  )
}

import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import { useTranslation } from '../i18n/LanguageContext'

export default function Blog() {
  const { t } = useTranslation()

  return (
    <PageShell>
      <PageHeader
        title={t('blog.title')}
        description={t('blog.description')}
      />
    </PageShell>
  )
}

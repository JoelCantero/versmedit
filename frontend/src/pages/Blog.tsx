import { useEffect, useState } from 'react'
import { fetchPosts, type PostSummary } from '../api/client'
import CategoryBadge from '../components/CategoryBadge'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import { useTranslation } from '../i18n/LanguageContext'

const CATEGORY_COLORS: Record<string, 'gray' | 'blue' | 'indigo' | 'green' | 'purple'> = {
  'Getting Started': 'blue',
  'How It Works': 'indigo',
  Features: 'green',
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function Blog() {
  const { t } = useTranslation()
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPosts = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await fetchPosts()
        setPosts(data.posts)
      } catch {
        setError(t('blog.loadError'))
      } finally {
        setIsLoading(false)
      }
    }

    void loadPosts()
  }, [])

  if (isLoading) {
    return (
      <PageShell className="max-w-5xl">
        <PageHeader title={t('blog.title')} description={t('blog.description')} />
        <div className="mt-10 flex justify-center">
          <div className="flex items-center gap-3 rounded-xl bg-white/60 px-4 py-3 ring-1 ring-gray-900/10 backdrop-blur-sm dark:bg-gray-900/40 dark:ring-white/10">
            <span className="size-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <span className="text-sm text-foreground">{t('blog.loading')}</span>
          </div>
        </div>
      </PageShell>
    )
  }

  if (error) {
    return (
      <PageShell className="max-w-5xl">
        <PageHeader title={t('blog.title')} description={t('blog.description')} />
        <div className="mt-10 flex justify-center">
          <div className="rounded-xl bg-white/60 p-6 text-center ring-1 ring-red-300 backdrop-blur-sm dark:bg-gray-900/40 dark:ring-red-500/40">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        </div>
      </PageShell>
    )
  }

  if (posts.length === 0) {
    return (
      <PageShell className="max-w-5xl">
        <PageHeader title={t('blog.title')} description={t('blog.noPosts')} />
      </PageShell>
    )
  }

  return (
    <PageShell className="max-w-5xl">
      <PageHeader title={t('blog.title')} description={t('blog.description')} />
      <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-12 lg:mx-0 lg:max-w-none lg:grid-cols-3">
        {posts.map((post) => (
          <article key={post.id} className="flex flex-col items-start">
            <div className="flex items-center gap-x-4 text-xs">
              <time dateTime={post.publishedAt} className="text-muted-foreground">
                {formatDate(post.publishedAt)}
              </time>
              <CategoryBadge color={CATEGORY_COLORS[post.category] ?? 'gray'}>
                {post.category}
              </CategoryBadge>
            </div>
            <div className="group relative">
              <h3 className="mt-3 text-lg/6 font-semibold text-foreground">
                {post.title}
              </h3>
              <p className="mt-5 line-clamp-3 text-sm/6 text-muted-foreground">
                {post.description}
              </p>
            </div>
            <div className="relative mt-6 flex items-center gap-x-4">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {(post.author.name ?? 'A').charAt(0).toUpperCase()}
              </div>
              <div className="text-sm/6">
                <p className="font-semibold text-foreground">
                  {post.author.name ?? 'Anonymous'}
                </p>
                <p className="text-muted-foreground">Author</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </PageShell>
  )
}

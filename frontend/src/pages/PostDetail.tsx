import { useEffect, useState } from 'react'
import { fetchPostBySlug, type PostDetail } from '../api/client'
import CategoryBadge from '../components/CategoryBadge'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import { useTranslation } from '../i18n/LanguageContext'
import { ArrowLeftIcon } from '@heroicons/react/24/solid'

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

interface PostDetailPageProps {
  slug: string
  onBack: () => void
}

export default function PostDetailPage({ slug, onBack }: PostDetailPageProps) {
  const { t } = useTranslation()
  const [post, setPost] = useState<PostDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPost = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const data = await fetchPostBySlug(slug)
        setPost(data.post)
      } catch {
        setError(t('blog.loadError'))
      } finally {
        setIsLoading(false)
      }
    }

    void loadPost()
  }, [slug, t])

  if (isLoading) {
    return (
      <PageShell className="max-w-3xl">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeftIcon className="size-4" />
          Back to blog
        </button>
        <div className="mt-10 flex justify-center">
          <div className="flex items-center gap-3 rounded-xl bg-white/60 px-4 py-3 ring-1 ring-gray-900/10 backdrop-blur-sm dark:bg-gray-900/40 dark:ring-white/10">
            <span className="size-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <span className="text-sm text-foreground">{t('blog.loading')}</span>
          </div>
        </div>
      </PageShell>
    )
  }

  if (error || !post) {
    return (
      <PageShell className="max-w-3xl">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeftIcon className="size-4" />
          Back to blog
        </button>
        <div className="mt-10 flex justify-center">
          <div className="rounded-xl bg-white/60 p-6 text-center ring-1 ring-red-300 backdrop-blur-sm dark:bg-gray-900/40 dark:ring-red-500/40">
            <p className="text-sm font-medium text-destructive">{error || 'Post not found'}</p>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell className="max-w-3xl">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <ArrowLeftIcon className="size-4" />
        Back to blog
      </button>

      <article className="mt-10">
        <header className="mx-auto max-w-2xl">
          <div className="flex items-center gap-x-4 text-xs">
            <time dateTime={post.publishedAt} className="text-muted-foreground">
              {formatDate(post.publishedAt)}
            </time>
            <CategoryBadge color={CATEGORY_COLORS[post.category] ?? 'gray'}>
              {post.category}
            </CategoryBadge>
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {post.title}
          </h1>
          <p className="mt-6 text-xl/8 text-muted-foreground">
            {post.description}
          </p>
        </header>

        <div className="mx-auto mt-10 max-w-2xl">
          <div className="mb-8 flex items-center gap-x-4">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(post.author.name ?? 'A').charAt(0).toUpperCase()}
            </div>
            <div className="text-sm/6">
              <p className="font-semibold text-foreground">
                {post.author.name ?? 'Anonymous'}
              </p>
              <p className="text-muted-foreground">Author</p>
            </div>
          </div>

          <div className="prose dark:prose-invert prose-sm sm:prose max-w-none">
            {post.content}
          </div>
        </div>
      </article>
    </PageShell>
  )
}

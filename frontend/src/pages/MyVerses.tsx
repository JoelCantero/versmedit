import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  createVerse,
  deleteVerse,
  fetchVerses,
  type VerseCategory,
  type VerseItem,
  updateVerse,
  updateVerseProgress,
} from '../api/client'
import FormInput from '../components/FormInput'
import FormTextArea from '../components/FormTextArea'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import VerseList from '../components/VerseList'
import { useTranslation } from '../i18n/LanguageContext'

type VerseForm = {
  verse: string
  reference: string
  categoryId: string
}

const emptyForm: VerseForm = {
  verse: '',
  reference: '',
  categoryId: '',
}

export default function MyVerses() {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<VerseCategory[]>([])
  const [verses, setVerses] = useState<VerseItem[]>([])
  const [form, setForm] = useState<VerseForm>(emptyForm)
  const [editingVerseId, setEditingVerseId] = useState<string | null>(null)

  const isAuthenticated = !isLoading && !error

  const submitLabel = useMemo(() => {
    if (isSaving) return t('myVerses.saving')
    return editingVerseId ? t('myVerses.updateVerse') : t('myVerses.addVerse')
  }, [editingVerseId, isSaving, t])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchVerses()
        setCategories(data.categories)
        setVerses(data.verses)
        setForm((prev) => ({
          ...prev,
          categoryId: prev.categoryId || data.categories[0]?.id || '',
        }))
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          setError(t('myVerses.loginRequired'))
        } else {
          setError(t('myVerses.loadError'))
        }
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [t])

  const resetForm = () => {
    setEditingVerseId(null)
    setForm({
      ...emptyForm,
      categoryId: categories[0]?.id || '',
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!form.verse.trim() || !form.reference.trim() || !form.categoryId) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (editingVerseId) {
        const response = await updateVerse(editingVerseId, {
          verse: form.verse,
          reference: form.reference,
          categoryId: form.categoryId,
        })

        setVerses((current) =>
          current.map((verse) => (verse.id === editingVerseId ? response.verse : verse)),
        )
      } else {
        const response = await createVerse({
          verse: form.verse,
          reference: form.reference,
          categoryId: form.categoryId,
        })

        setVerses((current) => [response.verse, ...current])
      }

      resetForm()
    } catch {
      setError(t('myVerses.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (verse: VerseItem) => {
    setEditingVerseId(verse.id)
    setForm({
      verse: verse.verse,
      reference: verse.reference,
      categoryId: verse.categoryId ?? categories[0]?.id ?? '',
    })
  }

  const handleDelete = async (verse: VerseItem) => {
    try {
      await deleteVerse(verse.id)
      setVerses((current) => current.filter((item) => item.id !== verse.id))
      if (editingVerseId === verse.id) {
        resetForm()
      }
    } catch {
      setError(t('myVerses.deleteError'))
    }
  }

  const handleProgressChange = async (verse: VerseItem, level: number) => {
    if (verse.leitnerLevel === level) {
      return
    }

    const previous = verse
    setVerses((current) =>
      current.map((item) =>
        item.id === verse.id
          ? {
              ...item,
              leitnerLevel: level,
              learningState: level === 7 ? 'MASTERED' : 'LEARNING',
            }
          : item,
      ),
    )

    try {
      const response = await updateVerseProgress(verse.id, level)
      setVerses((current) =>
        current.map((item) => (item.id === verse.id ? response.verse : item)),
      )
    } catch {
      setVerses((current) => current.map((item) => (item.id === verse.id ? previous : item)))
      setError(t('myVerses.progressError'))
    }
  }

  if (isLoading) {
    return (
      <PageShell className="max-w-5xl">
        <p className="text-sm font-medium text-muted-foreground">{t('myVerses.loading')}</p>
      </PageShell>
    )
  }

  return (
    <PageShell className="max-w-5xl">
      <PageHeader title={t('myVerses.title')} description={t('myVerses.description')} />

      {!isAuthenticated ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : (
        <>
          <form
            className="mt-8 space-y-3 rounded-xl border border-border bg-card p-4"
            onSubmit={handleSubmit}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <FormInput
                id="verse-reference"
                name="reference"
                value={form.reference}
                onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))}
                placeholder={t('myVerses.referencePlaceholder')}
                required
              />
              <select
                aria-label={t('myVerses.category')}
                value={form.categoryId}
                onChange={(event) => setForm((prev) => ({ ...prev, categoryId: event.target.value }))}
                className="h-11 rounded-2xl border border-border bg-background px-4 text-sm text-foreground focus:outline-none"
                required
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <FormTextArea
              id="verse-text"
              name="verse"
              value={form.verse}
              onChange={(event) => setForm((prev) => ({ ...prev, verse: event.target.value }))}
              placeholder={t('myVerses.versePlaceholder')}
              required
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={isSaving || categories.length === 0}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {submitLabel}
              </button>
              {editingVerseId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground"
                >
                  {t('myVerses.cancelEdit')}
                </button>
              ) : null}
            </div>
          </form>

          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

          <div className="mt-6">
            <VerseList
              verses={verses}
              emptyText={t('myVerses.empty')}
              progressLabel={t('myVerses.level')}
              categoryLabel={t('myVerses.category')}
              editLabel={t('myVerses.edit')}
              deleteLabel={t('myVerses.delete')}
              levelOptionsLabel={t('myVerses.changeProgress')}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onLevelChange={handleProgressChange}
            />
          </div>
        </>
      )}
    </PageShell>
  )
}

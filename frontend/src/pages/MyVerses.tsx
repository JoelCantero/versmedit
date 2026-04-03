import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  createVerse,
  deleteVerse,
  fetchVerses,
  type VerseCategory,
  type VerseItem,
  updateVerse,
} from '../api/client'
import Button from '../components/Button'
import CategoryColorSelect, { type CategoryColorValue } from '../components/CategoryColorSelect'
import ConfirmDialog from '../components/ConfirmDialog'
import FormInputSelect from '../components/FormInputSelect'
import FormInput from '../components/FormInput'
import Modal from '../components/Modal'
import FormTextArea from '../components/FormTextArea'
import PageHeader from '../components/PageHeader'
import PageShell from '../components/PageShell'
import VerseList from '../components/VerseList'
import { useTranslation } from '../i18n/LanguageContext'

type VerseForm = {
  verse: string
  reference: string
  categoryId: string
  categoryName: string
  categoryColor: CategoryColorValue
}

const emptyForm: VerseForm = {
  verse: '',
  reference: '',
  categoryId: '',
  categoryName: '',
  categoryColor: 'GRAY',
}

export default function MyVerses() {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<VerseCategory[]>([])
  const [verses, setVerses] = useState<VerseItem[]>([])
  const [form, setForm] = useState<VerseForm>(emptyForm)
  const [editingVerseId, setEditingVerseId] = useState<string | null>(null)
  const [pendingDeleteVerse, setPendingDeleteVerse] = useState<VerseItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const isAuthenticated = !isLoading && !error

  const submitLabel = useMemo(() => {
    if (isSaving) return t('myVerses.saving')
    return editingVerseId ? t('myVerses.updateVerse') : t('myVerses.addVerse')
  }, [editingVerseId, isSaving, t])

  const syncCategoryInList = (nextCategory: VerseCategory | null) => {
    if (!nextCategory) {
      return
    }

    setCategories((current) => {
      const existingIndex = current.findIndex((category) => category.id === nextCategory.id)

      if (existingIndex === -1) {
        return [...current, nextCategory].sort((a, b) => a.name.localeCompare(b.name))
      }

      const next = [...current]
      next[existingIndex] = nextCategory
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
  }

  const syncCategoryAcrossVerses = (nextCategory: VerseCategory | null) => {
    if (!nextCategory) {
      return
    }

    setVerses((current) =>
      current.map((verse) => {
        if (verse.categoryId !== nextCategory.id) {
          return verse
        }

        return {
          ...verse,
          category: nextCategory.name,
          categoryRel: {
            ...(verse.categoryRel ?? { id: nextCategory.id }),
            id: nextCategory.id,
            name: nextCategory.name,
            color: nextCategory.color,
          },
        }
      }),
    )
  }

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchVerses()
        setCategories(data.categories)
        setVerses(data.verses)
        setForm((prev) => ({
          ...prev,
          categoryId: prev.categoryId || data.categories[0]?.id || '',
          categoryName: prev.categoryName || data.categories[0]?.name || '',
          categoryColor: (prev.categoryColor || data.categories[0]?.color || 'GRAY') as CategoryColorValue,
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
      categoryId: '',
      categoryName: '',
      categoryColor: 'GRAY',
    })
    setIsComposerOpen(false)
  }

  const openCreateComposer = () => {
    setError(null)
    setEditingVerseId(null)
    setForm({
      ...emptyForm,
      categoryId: '',
      categoryName: '',
      categoryColor: 'GRAY',
    })
    setIsComposerOpen(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const categoryName = form.categoryName.trim()

    if (!form.verse.trim() || !form.reference.trim()) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (editingVerseId) {
        const response = await updateVerse(editingVerseId, {
          verse: form.verse,
          reference: form.reference,
          categoryId: form.categoryId || undefined,
          categoryName: categoryName || undefined,
          categoryColor: form.categoryColor,
        })

        setVerses((current) =>
          current.map((verse) => (verse.id === editingVerseId ? response.verse : verse)),
        )
        syncCategoryInList(response.verse.categoryRel)
        syncCategoryAcrossVerses(response.verse.categoryRel)
      } else {
        const response = await createVerse({
          verse: form.verse,
          reference: form.reference,
          categoryId: form.categoryId || undefined,
          categoryName: categoryName || undefined,
          categoryColor: form.categoryColor,
        })

        setVerses((current) => [response.verse, ...current])
        syncCategoryInList(response.verse.categoryRel)
        syncCategoryAcrossVerses(response.verse.categoryRel)
      }

      resetForm()
    } catch {
      setError(t('myVerses.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (verse: VerseItem) => {
    setError(null)
    setEditingVerseId(verse.id)

    const resolvedCategoryName = (verse.categoryRel?.name ?? verse.category ?? '').trim()
    const hasCategory = Boolean(verse.categoryId || resolvedCategoryName)

    setForm({
      verse: verse.verse,
      reference: verse.reference,
      categoryId: hasCategory ? verse.categoryId ?? '' : '',
      categoryName: hasCategory ? resolvedCategoryName : '',
      categoryColor: hasCategory
        ? (verse.categoryRel?.color ?? 'GRAY') as CategoryColorValue
        : 'GRAY',
    })
    setIsComposerOpen(true)
  }

  const handleRequestDelete = (verse: VerseItem) => {
    setPendingDeleteVerse(verse)
  }

  const handleCancelDelete = () => {
    if (isDeleting) {
      return
    }

    setPendingDeleteVerse(null)
  }

  const handleConfirmDelete = async () => {
    if (!pendingDeleteVerse) {
      return
    }

    setIsDeleting(true)

    try {
      await deleteVerse(pendingDeleteVerse.id)
      setVerses((current) => current.filter((item) => item.id !== pendingDeleteVerse.id))
      if (editingVerseId === pendingDeleteVerse.id) {
        resetForm()
      }
      setPendingDeleteVerse(null)
    } catch {
      setError(t('myVerses.deleteError'))
    } finally {
      setIsDeleting(false)
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
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

          <div className="mt-8">
            <VerseList
              verses={verses}
              emptyText={t('myVerses.empty')}
              progressLabel={t('myVerses.level')}
              categoryLabel={t('myVerses.category')}
              noCategoryLabel={t('myVerses.noCategory')}
              editLabel={t('myVerses.edit')}
              deleteLabel={t('myVerses.delete')}
              onEdit={handleEdit}
              onDelete={handleRequestDelete}
            />
          </div>

          <button
            type="button"
            onClick={openCreateComposer}
            aria-label={t('myVerses.addVerse')}
            className="fixed right-6 bottom-6 z-40 inline-flex size-14 items-center justify-center rounded-full bg-primary text-3xl leading-none font-semibold text-primary-foreground shadow-lg transition hover:scale-105 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            +
          </button>

          <Modal open={isComposerOpen} onClose={resetForm} panelClassName="sm:max-w-2xl">
            <div className="p-4 sm:p-6">
              <form className="space-y-3" onSubmit={handleSubmit}>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormInput
                    id="verse-reference"
                    name="reference"
                    value={form.reference}
                    onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))}
                    placeholder={t('myVerses.referencePlaceholder')}
                    required
                  />
                  <div className="flex items-center gap-2">
                    <FormInputSelect
                      id="verse-category"
                      value={form.categoryId}
                      inputValue={form.categoryName}
                      selectedColor={form.categoryColor}
                      containerClassName="flex-1"
                      onChange={(nextValue) => setForm((prev) => {
                        const selectedCategory = categories.find((category) => category.id === nextValue)

                        return {
                          ...prev,
                          categoryId: nextValue,
                          categoryColor: (selectedCategory?.color ?? prev.categoryColor ?? 'GRAY') as CategoryColorValue,
                        }
                      })}
                      onInputValueChange={(nextValue) => setForm((prev) => ({ ...prev, categoryName: nextValue }))}
                      options={categories.map((category) => ({
                        value: category.id,
                        label: category.name,
                        color: category.color,
                      }))}
                      placeholder={t('myVerses.category')}
                    />
                    <CategoryColorSelect
                      value={form.categoryColor}
                      onChange={(nextColor) => setForm((prev) => ({ ...prev, categoryColor: nextColor }))}
                      ariaLabel={t('myVerses.category')}
                    />
                  </div>
                </div>

                <FormTextArea
                  id="verse-text"
                  name="verse"
                  value={form.verse}
                  onChange={(event) => setForm((prev) => ({ ...prev, verse: event.target.value }))}
                  placeholder={t('myVerses.versePlaceholder')}
                  required
                />

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={resetForm}
                  >
                    {t('myVerses.cancelEdit')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSaving || categories.length === 0}
                  >
                    {submitLabel}
                  </Button>
                </div>
              </form>
            </div>
          </Modal>

          <ConfirmDialog
            open={Boolean(pendingDeleteVerse)}
            title={t('myVerses.deleteDialogTitle')}
            description={
              pendingDeleteVerse
                ? t('myVerses.deleteDialogDescription').replace('{reference}', pendingDeleteVerse.reference)
                : t('myVerses.deleteDialogDescription').replace('{reference}', '')
            }
            confirmLabel={t('myVerses.deleteDialogConfirm')}
            cancelLabel={t('myVerses.deleteDialogCancel')}
            onConfirm={handleConfirmDelete}
            onCancel={handleCancelDelete}
            isConfirming={isDeleting}
          />
        </>
      )}
    </PageShell>
  )
}

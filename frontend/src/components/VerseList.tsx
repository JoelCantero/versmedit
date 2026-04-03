import CategoryBadge, { toBadgeColor } from './CategoryBadge'
import Button from './Button'
import EditIcon from '../assets/icons/EditIcon'
import TrashIcon from '../assets/icons/TrashIcon'
import type { VerseItem } from '../api/client'

type VerseListProps = {
  verses: VerseItem[]
  emptyText: string
  progressLabel: string
  categoryLabel: string
  noCategoryLabel: string
  editLabel: string
  deleteLabel: string
  onEdit: (verse: VerseItem) => void
  onDelete: (verse: VerseItem) => void
}

const levelDotColors: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-amber-500',
  4: 'bg-yellow-500',
  5: 'bg-lime-500',
  6: 'bg-green-500',
  7: 'bg-emerald-500',
}

const levelRingColors: Record<number, string> = {
  1: 'bg-red-500/30',
  2: 'bg-orange-500/30',
  3: 'bg-amber-500/30',
  4: 'bg-yellow-500/30',
  5: 'bg-lime-500/30',
  6: 'bg-green-500/30',
  7: 'bg-emerald-500/30',
}

export default function VerseList({
  verses,
  emptyText,
  progressLabel,
  categoryLabel: _categoryLabel,
  noCategoryLabel,
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: VerseListProps) {
  if (verses.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <ul role="list" className="divide-y divide-border">
      {verses.map((verse) => {
        const categoryName = (verse.categoryRel?.name ?? verse.category)?.trim() || noCategoryLabel
        const dot = levelDotColors[verse.leitnerLevel] ?? 'bg-gray-500'
        const ring = levelRingColors[verse.leitnerLevel] ?? 'bg-gray-500/30'
        return (
          <li key={verse.id} className="flex items-center justify-between gap-x-6 py-5">
            <div className="flex min-w-0 gap-x-4">
              <div className="min-w-0 flex-auto">
                <p className="text-sm/6 font-semibold text-foreground">{verse.reference}</p>
                <p className="mt-1 truncate text-xs/5 text-muted-foreground">{verse.verse}</p>
                <div className="mt-2 flex items-center gap-x-3">
                  <CategoryBadge color={toBadgeColor(verse.categoryRel?.color)}>
                    {categoryName}
                  </CategoryBadge>
                  <div className="flex items-center gap-x-2">
                    <div className={`flex-none rounded-full p-1 ${ring}`}>
                      <div className={`size-1.5 rounded-full ${dot}`} />
                    </div>
                    <p className="text-xs/5 text-muted-foreground">
                      {progressLabel} {verse.leitnerLevel}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden shrink-0 sm:flex sm:items-center">
              <div className="flex items-center gap-x-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onEdit(verse)}
                >
                  <span className="sr-only">{editLabel}</span>
                  <EditIcon/>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onDelete(verse)}
                >
                  <span className="sr-only">{deleteLabel}</span>
                  <TrashIcon />
                </Button>
              </div>
            </div>

            {/* Mobile-only actions */}
            <div className="flex shrink-0 flex-col items-end gap-2 sm:hidden">
              <div className="flex gap-x-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onEdit(verse)}
                >
                  <span className="sr-only">{editLabel}</span>
                  <EditIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onDelete(verse)}
                >
                  <span className="sr-only">{deleteLabel}</span>
                  <TrashIcon/>
                </Button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

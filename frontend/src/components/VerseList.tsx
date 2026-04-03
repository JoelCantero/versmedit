import CategoryBadge, { toBadgeColor } from './CategoryBadge'
import type { VerseItem } from '../api/client'

type VerseListProps = {
  verses: VerseItem[]
  emptyText: string
  progressLabel: string
  categoryLabel: string
  editLabel: string
  deleteLabel: string
  levelOptionsLabel: string
  onEdit: (verse: VerseItem) => void
  onDelete: (verse: VerseItem) => void
  onLevelChange: (verse: VerseItem, level: number) => void
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
  categoryLabel,
  editLabel,
  deleteLabel,
  levelOptionsLabel,
  onEdit,
  onDelete,
  onLevelChange,
}: VerseListProps) {
  if (verses.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <ul role="list" className="divide-y divide-border">
      {verses.map((verse) => {
        const categoryName = verse.categoryRel?.name ?? verse.category
        const dot = levelDotColors[verse.leitnerLevel] ?? 'bg-gray-500'
        const ring = levelRingColors[verse.leitnerLevel] ?? 'bg-gray-500/30'
        return (
          <li key={verse.id} className="flex justify-between gap-x-6 py-5">
            <div className="flex min-w-0 gap-x-4">
              <div className="min-w-0 flex-auto">
                <p className="text-sm/6 font-semibold text-foreground">{verse.reference}</p>
                <p className="mt-1 truncate text-xs/5 text-muted-foreground">{verse.verse}</p>
              </div>
            </div>

            <div className="hidden shrink-0 sm:flex sm:flex-col sm:items-end">
              <CategoryBadge color={toBadgeColor(verse.categoryRel?.color)}>
                {categoryName}
              </CategoryBadge>
              <div className="mt-1 flex items-center gap-x-2">
                <div className={`flex-none rounded-full p-1 ${ring}`}>
                  <div className={`size-1.5 rounded-full ${dot}`} />
                </div>
                <p className="text-xs/5 text-muted-foreground">
                  {progressLabel} {verse.leitnerLevel}
                </p>
              </div>

              <div className="mt-2 flex items-center gap-x-2">
                <label className="sr-only" htmlFor={`verse-level-${verse.id}`}>
                  {levelOptionsLabel}
                </label>
                <select
                  id={`verse-level-${verse.id}`}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                  value={verse.leitnerLevel}
                  onChange={(event) => onLevelChange(verse, Number(event.target.value))}
                >
                  {Array.from({ length: 7 }, (_, index) => index + 1).map((level) => (
                    <option key={level} value={level}>
                      {progressLabel} {level}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onEdit(verse)}
                  className="rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-accent"
                >
                  {editLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(verse)}
                  className="rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  {deleteLabel}
                </button>
              </div>
            </div>

            {/* Mobile-only actions */}
            <div className="flex shrink-0 flex-col items-end gap-2 sm:hidden">
              <div className="flex items-center gap-x-1.5">
                <div className={`flex-none rounded-full p-1 ${ring}`}>
                  <div className={`size-1.5 rounded-full ${dot}`} />
                </div>
                <p className="text-xs/5 text-muted-foreground">{verse.leitnerLevel}</p>
              </div>
              <div className="flex gap-x-2">
                <button
                  type="button"
                  onClick={() => onEdit(verse)}
                  className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-accent"
                >
                  {editLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(verse)}
                  className="rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  {deleteLabel}
                </button>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

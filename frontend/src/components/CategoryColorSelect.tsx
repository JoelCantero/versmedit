import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { ChevronUpDownIcon } from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/20/solid'

export const categoryColorOptions = [
  { value: 'GRAY', label: 'Gray', dotClassName: 'bg-gray-400' },
  { value: 'RED', label: 'Red', dotClassName: 'bg-red-400' },
  { value: 'YELLOW', label: 'Yellow', dotClassName: 'bg-yellow-400' },
  { value: 'GREEN', label: 'Green', dotClassName: 'bg-green-400' },
  { value: 'BLUE', label: 'Blue', dotClassName: 'bg-blue-400' },
  { value: 'INDIGO', label: 'Indigo', dotClassName: 'bg-indigo-400' },
  { value: 'PURPLE', label: 'Purple', dotClassName: 'bg-purple-400' },
  { value: 'PINK', label: 'Pink', dotClassName: 'bg-pink-400' },
] as const

export type CategoryColorValue = (typeof categoryColorOptions)[number]['value']

type CategoryColorSelectProps = {
  value: CategoryColorValue
  onChange: (value: CategoryColorValue) => void
  ariaLabel?: string
}

export default function CategoryColorSelect({
  value,
  onChange,
  ariaLabel = 'Category color',
}: CategoryColorSelectProps) {
  const selected = categoryColorOptions.find((option) => option.value === value) ?? categoryColorOptions[0]

  return (
    <Listbox value={selected} onChange={(option) => onChange(option.value)}>
      <div className="relative w-14 shrink-0">
        <ListboxButton
          aria-label={ariaLabel}
          className="grid h-10 w-full grid-cols-1 rounded-full bg-white/5 px-3 text-left text-sm/6 text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <span className="col-start-1 row-start-1 flex items-center justify-center pr-6">
            <span className={`h-4 w-4 shrink-0 rounded-full ${selected.dotClassName}`} />
          </span>
          <ChevronUpDownIcon
            aria-hidden="true"
            className="col-start-1 row-start-1 size-4 self-center justify-self-end text-muted-foreground"
          />
        </ListboxButton>

        <ListboxOptions
          anchor="bottom"
          portal
          className="z-[70] mt-2 max-h-56 w-[var(--button-width)] overflow-auto rounded-2xl border border-border bg-card p-1 text-sm shadow-lg"
        >
          {categoryColorOptions.map((option) => (
            <ListboxOption
              key={option.value}
              value={option}
              className="group relative cursor-pointer rounded-xl px-3 py-2 text-foreground data-focus:bg-accent"
            >
              <div className="flex items-center justify-center">
                <span className={`h-4 w-4 shrink-0 rounded-full ${option.dotClassName}`} />
              </div>

              <span className="absolute inset-y-0 right-2 hidden items-center text-primary group-data-selected:flex">
                <CheckIcon aria-hidden="true" className="size-4" />
              </span>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
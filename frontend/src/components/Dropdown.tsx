import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'

type DropdownItem = {
  label: string
  onClick: () => void
}

type DropdownProps = {
  label: string
  items: DropdownItem[]
}

export default function Dropdown({ label, items }: DropdownProps) {
  return (
    <Menu as="div" className="relative inline-block">
      <MenuButton className="cursor-pointer inline-flex items-center gap-x-1 text-sm/6 font-semibold text-foreground">
        {label}
        <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
      </MenuButton>

      <MenuItems
        transition
        className="absolute right-0 z-10 mt-2 w-40 origin-top-right rounded-xl bg-card p-1 shadow-lg ring-1 ring-gray-900/10 transition dark:ring-white/10 data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
      >
        {items.map((item) => (
          <MenuItem key={item.label}>
            <button
              type="button"
              onClick={item.onClick}
              className="block w-full rounded-full px-3 py-2 text-left text-sm font-medium text-foreground data-focus:bg-accent"
            >
              {item.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  )
}

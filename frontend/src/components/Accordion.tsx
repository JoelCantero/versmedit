import { Disclosure as HeadlessDisclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { ReactNode } from 'react'

type AccordionItem = {
  title: string
  content: ReactNode
}

type AccordionProps = {
  items: AccordionItem[]
}

export default function Accordion({ items }: AccordionProps) {
  return (
    <div className="divide-y divide-border rounded-xl bg-card">
      {items.map((item) => (
        <HeadlessDisclosure key={item.title} as="div" className="p-6">
          <DisclosureButton className="group flex w-full items-center justify-between cursor-pointer">
            <span className="text-sm/6 font-medium text-foreground group-data-hover:text-foreground/80">
              {item.title}
            </span>
            <ChevronDownIcon className="size-5 fill-muted-foreground group-data-hover:fill-muted-foreground/80 group-data-open:rotate-180" />
          </DisclosureButton>
          <DisclosurePanel className="mt-2 text-sm/5 text-muted-foreground">
            {item.content}
          </DisclosurePanel>
        </HeadlessDisclosure>
      ))}
    </div>
  )
}

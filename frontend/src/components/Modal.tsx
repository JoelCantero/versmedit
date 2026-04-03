import type { ReactNode } from 'react'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'

type ModalProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  panelClassName?: string
}

export default function Modal({
  open,
  onClose,
  children,
  panelClassName = 'sm:max-w-lg',
}: ModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-gray-900/50 transition-opacity duration-300 ease-out data-closed:opacity-0"
      />

      <div className="fixed inset-0 z-50 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className={`relative transform overflow-hidden rounded-2xl bg-card text-left shadow-xl ring-1 ring-gray-900/10 transition-all duration-300 ease-out data-closed:translate-y-4 data-closed:opacity-0 data-enter:sm:data-closed:translate-y-0 data-enter:sm:data-closed:scale-95 data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full dark:ring-white/10 ${panelClassName}`}
          >
            {children}
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import Button from './Button'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  isConfirming?: boolean
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  isConfirming = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/30 transition duration-300 ease-out data-closed:opacity-0"
      />

      <div className="fixed inset-0 z-50 w-screen overflow-y-auto">
        <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <DialogPanel
            transition
            className="relative transform overflow-hidden rounded-2xl bg-card px-4 pb-4 pt-5 text-left shadow-xl ring-1 ring-gray-900/10 transition-all duration-300 ease-out data-closed:translate-y-4 data-closed:opacity-0 data-enter:sm:data-closed:translate-y-0 data-enter:sm:data-closed:scale-95 data-leave:duration-200 data-leave:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 dark:ring-white/10"
          >
            <div className="sm:flex sm:items-start">
              <div className="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:size-10">
                <ExclamationTriangleIcon aria-hidden="true" className="size-6 text-red-600 sm:size-5" />
              </div>

              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                <DialogTitle as="h3" className="text-base font-semibold text-foreground">
                  {title}
                </DialogTitle>
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:mt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant="primary"
                className="bg-destructive text-white hover:bg-destructive/90 focus-visible:outline-destructive"
                onClick={onConfirm}
                disabled={isConfirming}
              >
                {confirmLabel}
              </Button>
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}

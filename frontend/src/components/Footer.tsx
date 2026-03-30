export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-white/35 backdrop-blur-sm dark:bg-gray-950/20">
      <div className="flex items-center justify-between p-6 lg:px-8">
        <p className="text-sm/6 font-semibold text-gray-900 dark:text-gray-100">© {currentYear} Versmedit. All rights reserved.</p>
        <div className="flex items-center gap-x-12">
          <a href="#" className="text-sm/6 font-semibold text-gray-900 transition-colors hover:text-black dark:text-gray-100 dark:hover:text-white">
            Privacy
          </a>
          <a href="#" className="text-sm/6 font-semibold text-gray-900 transition-colors hover:text-black dark:text-gray-100 dark:hover:text-white">
            Terms
          </a>
          <a href="#" className="text-sm/6 font-semibold text-gray-900 transition-colors hover:text-black dark:text-gray-100 dark:hover:text-white">
            Contact
          </a>
        </div>
      </div>
    </footer>
  )
}

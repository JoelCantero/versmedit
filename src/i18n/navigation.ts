import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

// Locale-aware navigation APIs. Use these instead of `next/link` and
// `next/navigation` so links/redirects keep the active locale prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

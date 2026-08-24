import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import {
  POLICY_PATHS,
  type PolicyLocale,
} from "@/modules/signup/policy";

interface AppFooterProps {
  locale: PolicyLocale;
}

const footerDestinations = [
  {
    id: "terms",
    path: POLICY_PATHS.terms,
    labelKey: "terms.title",
    position: 1,
  },
  {
    id: "privacy",
    path: POLICY_PATHS.privacy,
    labelKey: "privacy.title",
    position: 2,
  },
] as const;

export async function AppFooter({ locale }: AppFooterProps) {
  const [footerTranslations, policyTranslations] = await Promise.all([
    getTranslations({ locale, namespace: "Footer" }),
    getTranslations({ locale, namespace: "Policies" }),
  ]);

  return (
    <footer className="shrink-0 border-t border-border bg-background px-4 py-3 text-sm text-foreground sm:px-6">
      <nav
        className="mx-auto flex w-full max-w-7xl justify-center sm:justify-end"
        aria-label={footerTranslations("navigationLabel")}
      >
        <ul className="flex min-w-0 flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:justify-end">
          {footerDestinations.map((destination) => (
            <li className="min-w-0" key={destination.id}>
              <Link
                className="inline-flex min-h-6 max-w-full items-center whitespace-normal rounded-sm px-1 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-solid forced-colors:focus-visible:outline-offset-2"
                href={destination.path}
              >
                {policyTranslations(destination.labelKey)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
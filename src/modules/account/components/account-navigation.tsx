import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface AccountNavigationMessages {
  ariaLabel: string;
  profile: string;
  dataAndPrivacy: string;
  security: string;
}

interface AccountNavigationProps {
  active: "profile" | "data" | "security";
  messages: AccountNavigationMessages;
}

const navigationItemClass =
  "inline-flex min-h-11 min-w-0 items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-muted aria-[current=page]:text-foreground motion-reduce:transition-none";

export function AccountNavigation({
  active,
  messages,
}: AccountNavigationProps) {
  return (
    <nav aria-label={messages.ariaLabel} className="md:sticky md:top-6">
      <ul className="flex min-w-0 flex-row flex-wrap gap-2 md:flex-col">
        <li className="min-w-0">
          <Link
            href="/account"
            aria-current={active === "profile" ? "page" : undefined}
            className={cn(navigationItemClass, "w-full")}
          >
            {messages.profile}
          </Link>
        </li>
        <li className="min-w-0">
          <Link
            href="/account/data"
            aria-current={active === "data" ? "page" : undefined}
            className={cn(navigationItemClass, "w-full")}
          >
            {messages.dataAndPrivacy}
          </Link>
        </li>
        <li className="min-w-0">
          <Link
            href="/account/security"
            aria-current={active === "security" ? "page" : undefined}
            className={cn(navigationItemClass, "w-full")}
          >
            {messages.security}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
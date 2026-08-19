"use client";

import { useTransition } from "react";
import { Check, Globe, Moon, Sun } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";

import { getPathname, Link, usePathname } from "@/i18n/navigation";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface HomeNavigationProps {
  authenticated: boolean;
  locale: "en" | "es" | "ca";
  labels: {
    ariaLabel: string;
    account?: string;
    login: string;
    signup: string;
    logout: string;
    toggleTheme: string;
    language: string;
  };
}

const languages = [
  { locale: "ca", label: "CA" },
  { locale: "en", label: "ENG" },
  { locale: "es", label: "ES" },
] as const;

export function HomeNavigation({
  authenticated,
  locale,
  labels,
}: HomeNavigationProps) {
  const [isPending, startTransition] = useTransition();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const homePath = locale === "en" ? "/" : `/${locale}`;
  const currentLanguage = languages.find((language) => language.locale === locale);
  const accountPath = locale === "en" ? "/account" : `/${locale}/account`;
  const isAccountRoute = pathname === accountPath;

  function logout() {
    startTransition(() => {
      void signOut({ callbackUrl: homePath });
    });
  }

  return (
    <NavigationMenu aria-label={labels.ariaLabel}>
      <NavigationMenuList>
        {authenticated ? (
          <>
            {labels.account ? (
              <NavigationMenuItem>
                <NavigationMenuLink
                  render={<Link href="/account" aria-current={isAccountRoute ? "page" : undefined} />}
                >
                  {labels.account}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : null}
            <NavigationMenuItem>
              <button
                type="button"
                className={navigationMenuTriggerStyle()}
                disabled={isPending}
                onClick={logout}
              >
                {labels.logout}
              </button>
            </NavigationMenuItem>
          </>
        ) : (
          <>
            <NavigationMenuItem>
              <NavigationMenuLink render={<Link href="/login" />}>
                {labels.login}
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink render={<Link href="/signup" />}>
                {labels.signup}
              </NavigationMenuLink>
            </NavigationMenuItem>
          </>
        )}
        <li className="hidden h-9 items-center px-1 sm:flex" aria-hidden="true">
          <span className="flex h-5">
            <Separator orientation="vertical" />
          </span>
        </li>
        <NavigationMenuItem>
          <NavigationMenuTrigger aria-label={labels.language}>
            <Globe className="mr-1 size-4" aria-hidden="true" />
            {currentLanguage?.label}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-36">
              <li>
                {languages.map((language) => {
                  const isCurrent = language.locale === locale;
                  const localizedPath =
                    language.locale === "en"
                      ? `/en${pathname === "/" ? "" : pathname}`
                      : getPathname({ href: pathname, locale: language.locale });

                  return (
                    <NavigationMenuLink
                      key={language.locale}
                      render={
                        <a
                          href={localizedPath}
                          className="flex-row items-center gap-2"
                          aria-current={isCurrent ? "page" : undefined}
                          onClickCapture={(event) => {
                            event.preventDefault();
                            window.location.assign(localizedPath);
                          }}
                        />
                      }
                    >
                      <Check
                        className={cn("size-4", !isCurrent && "invisible")}
                        aria-hidden="true"
                      />
                      {language.label}
                    </NavigationMenuLink>
                  );
                })}
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <button
            type="button"
            className={cn(navigationMenuTriggerStyle(), "relative size-9 px-0")}
            aria-label={labels.toggleTheme}
            title={labels.toggleTheme}
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="size-4 scale-100 rotate-0 dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute inset-0 m-auto size-4 scale-0 rotate-90 dark:scale-100 dark:rotate-0" />
          </button>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
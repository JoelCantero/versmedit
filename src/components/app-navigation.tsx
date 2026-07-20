"use client";

import { useState, useTransition } from "react";
import { Check, Globe, LogIn, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

interface AppNavigationProps {
  authenticated: boolean;
  user?: {
    image: string | null;
    initials: string;
  };
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

export function AppNavigation({
  authenticated,
  user,
  locale,
  labels,
}: AppNavigationProps) {
  const [isPending, startTransition] = useTransition();
  const [failedImage, setFailedImage] = useState<string | null>(null);
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
    <NavigationMenu
      aria-label={labels.ariaLabel}
      className="min-w-0 max-w-full justify-end"
    >
      <NavigationMenuList className="w-auto flex-nowrap justify-end">
        {authenticated ? (
          <NavigationMenuItem>
            <NavigationMenuTrigger
              aria-label={labels.account}
              className="size-9 overflow-hidden rounded-full p-0 [&>svg]:hidden"
            >
              <Avatar className="size-9">
                <AvatarFallback className="text-xs">{user?.initials ?? "?"}</AvatarFallback>
                {user?.image && failedImage !== user.image ? (
                  <AvatarImage
                    className="absolute inset-0"
                    src={user.image}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImage(user.image)}
                  />
                ) : null}
              </Avatar>
            </NavigationMenuTrigger>
            <NavigationMenuContent>
              <ul className="grid w-[200px]">
                <li>
                  {labels.account ? (
                    <NavigationMenuLink
                      className="w-full justify-start text-left"
                      render={
                        <Link
                          href="/account"
                          className="flex-row items-center gap-2"
                          aria-current={isAccountRoute ? "page" : undefined}
                        />
                      }
                    >
                      <UserRound aria-hidden="true" />
                      {labels.account}
                    </NavigationMenuLink>
                  ) : null}
                  <NavigationMenuLink
                    aria-disabled={isPending}
                    className={cn(
                      "w-full cursor-pointer flex-row items-center justify-start gap-2 text-left",
                      isPending && "pointer-events-none opacity-50",
                    )}
                    render={
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={logout}
                      />
                    }
                  >
                    <LogOut aria-hidden="true" />
                    {labels.logout}
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        ) : (
          <>
            <NavigationMenuItem>
              <NavigationMenuLink
                aria-label={labels.login}
                className="size-9 justify-center p-0 min-[30rem]:h-auto min-[30rem]:w-auto min-[30rem]:justify-start min-[30rem]:p-2"
                render={<Link href="/login" />}
              >
                <LogIn aria-hidden="true" />
                <span className="sr-only min-[30rem]:not-sr-only">{labels.login}</span>
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem className="hidden min-[30rem]:block">
              <button
                type="button"
                className={cn(navigationMenuTriggerStyle(), "cursor-not-allowed")}
                disabled
              >
                {labels.signup}
              </button>
            </NavigationMenuItem>
          </>
        )}
        <li className="hidden h-9 items-center px-1 min-[30rem]:flex" aria-hidden="true">
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
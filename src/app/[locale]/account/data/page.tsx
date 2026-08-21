import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { AccountNavigation } from "@/modules/account/components/account-navigation";
import { DeleteAccountDialog } from "@/modules/account/deletion/components/delete-account-dialog";
import { getAccountDeletionLoginPath } from "@/modules/account/deletion/schema";
import {
  readAccountSessionToken,
  resolveActiveAccountSession,
} from "@/modules/account/deletion/session";
import { getSessionUserId } from "@/modules/account/session";
import { parseLoginLocale } from "@/modules/login/schema";

interface AccountDataPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: AccountDataPageProps): Promise<Metadata> {
  const locale = parseLoginLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Account.data.metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function AccountDataPage({
  params,
  searchParams,
}: AccountDataPageProps) {
  const locale = parseLoginLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Account" });
  const session = await getServerSession(authOptions);
  const sessionUserId = getSessionUserId(session);
  if (!sessionUserId) redirect(getAccountDeletionLoginPath(locale));

  const cookieStore = await cookies();
  const activeSession = await resolveActiveAccountSession(
    readAccountSessionToken(cookieStore.toString()),
  );
  if (!activeSession || activeSession.userId !== sessionUserId) {
    redirect(getAccountDeletionLoginPath(locale));
  }

  const query = await searchParams;
  const intent = query.intent === "delete";
  const invalidState = query.state === "invalid_link" || query.state === "session_conflict";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <section className="grid min-w-0 gap-6 md:grid-cols-[minmax(11rem,13rem)_minmax(0,1fr)] md:items-start md:gap-8">
        <AccountNavigation
          active="data"
          messages={{
            ariaLabel: t("navigation.profileAriaLabel"),
            profile: t("navigation.profile"),
            dataAndPrivacy: t("navigation.dataAndPrivacy"),
          }}
        />

        <div className="min-w-0 space-y-10">
          <header className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              {t("data.heading.title")}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("data.heading.description")}
            </p>
          </header>

          {invalidState ? (
            <p role="alert" className="text-sm text-destructive">
              {query.state === "session_conflict"
                ? t("deletion.states.sessionConflict")
                : t("deletion.states.invalidLink")}
            </p>
          ) : null}

          <section
            aria-labelledby="delete-account-heading"
            className="space-y-5 border-t border-destructive/40 pt-8"
          >
            <div className="space-y-2">
              <h2 id="delete-account-heading" className="text-lg font-semibold text-foreground">
                {t("data.deletion.title")}
              </h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t("data.deletion.description")}
              </p>
            </div>

            <DeleteAccountDialog
              locale={locale}
              recentlyAuthenticated={activeSession.recentlyAuthenticated}
              intent={intent}
              messages={{
                deleteTrigger: t("deletion.dialog.deleteTrigger"),
                title: t("deletion.dialog.title"),
                description: t("deletion.dialog.description"),
                irreversible: t("deletion.dialog.irreversible"),
                signOutEverywhere: t("deletion.dialog.signOutEverywhere"),
                invalidateLinks: t("deletion.dialog.invalidateLinks"),
                removeData: t("deletion.dialog.removeData"),
                loseAccess: t("deletion.dialog.loseAccess"),
                cancel: t("deletion.dialog.cancel"),
                continue: t("deletion.dialog.continue"),
                sendLink: t("deletion.dialog.sendLink"),
                sendingLink: t("deletion.dialog.sendingLink"),
                reauthSent: t("deletion.dialog.reauthSent"),
                reauthError: t("deletion.dialog.reauthError"),
                confirmTitle: t("deletion.dialog.confirmTitle"),
                confirmDescription: t("deletion.dialog.confirmDescription"),
                confirmDelete: t("deletion.dialog.confirmDelete"),
                deleting: t("deletion.dialog.deleting"),
                deletionError: t("deletion.dialog.deletionError"),
                recovering: t("deletion.dialog.recovering"),
                closeLabel: t("deletion.dialog.closeLabel"),
              }}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
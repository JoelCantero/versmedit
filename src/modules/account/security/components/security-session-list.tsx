"use client";

import { LogOutIcon, ShieldCheckIcon, ShieldXIcon } from "lucide-react";
import { signOut } from "next-auth/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SecuritySessionDialog,
  SecuritySessionTimestamp,
  type SecuritySessionDialogMessages,
} from "@/modules/account/security/components/security-session-dialog";
import type { SessionListItem } from "@/modules/account/security/types";
import type { AccountLocale } from "@/modules/account/types";

export interface SecuritySessionListMessages {
  ariaLabel: string;
  sessionLabel: string;
  current: string;
  currentOnly: string;
  startedAt: string;
  expiresAt: string;
  unavailable: string;
  signOut: string;
  revokeSession: string;
  revokeOtherSessions: string;
  dialog: SecuritySessionDialogMessages;
}

interface SecuritySessionListProps {
  locale: AccountLocale;
  sessions: SessionListItem[];
  messages: SecuritySessionListMessages;
  descriptionId?: string;
  signOutCurrent?: () => void | Promise<void>;
}

function sessionLabel(template: string, ordinal: number) {
  return template.replace("{number}", String(ordinal));
}

export function SecuritySessionList({
  locale,
  sessions,
  messages,
  descriptionId,
  signOutCurrent,
}: SecuritySessionListProps) {
  const homePath = locale === "en" ? "/" : `/${locale}`;
  const endCurrentSession =
    signOutCurrent ?? (() => signOut({ callbackUrl: homePath }));
  const currentSession = sessions.find((session) => session.current);
  const bulkAvailable = sessions.length > 1 && currentSession;

  return (
    <div className="min-w-0">
      <div className="mb-5 flex min-w-0 flex-col items-start gap-2">
        {bulkAvailable ? (
          <SecuritySessionDialog
            mode="bulk"
            locale={locale}
            session={currentSession}
            triggerLabel={messages.revokeOtherSessions}
            messages={messages.dialog}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-11 whitespace-normal text-center motion-reduce:transition-none"
            disabled
          >
            <ShieldXIcon data-icon="inline-start" aria-hidden="true" />
            {messages.revokeOtherSessions}
          </Button>
        )}
        {sessions.length === 1 ? (
          <p className="text-sm text-muted-foreground">
            {messages.currentOnly}
          </p>
        ) : null}
      </div>

      <ol
        aria-label={messages.ariaLabel}
        aria-describedby={descriptionId}
        className="min-w-0 divide-y divide-border border-y border-border"
      >
        {sessions.map((session) => {
          const rowId = `account-session-${session.ordinal}`;
          const titleId = `${rowId}-title`;
          const metadataId = `${rowId}-metadata`;
          const currentId = `${rowId}-current`;

          return (
            <li
              key={session.sessionId}
              aria-current={session.current ? "true" : undefined}
              aria-labelledby={titleId}
              aria-describedby={
                session.current ? `${currentId} ${metadataId}` : metadataId
              }
              className="grid min-w-0 grid-cols-1 gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] sm:items-center sm:gap-6"
            >
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3
                    id={titleId}
                    className="break-words text-base font-semibold text-foreground"
                  >
                    {sessionLabel(messages.sessionLabel, session.ordinal)}
                  </h3>
                  {session.current ? (
                    <Badge
                      id={currentId}
                      variant="secondary"
                      className="h-auto min-w-0 whitespace-normal break-words"
                    >
                      <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
                      {messages.current}
                    </Badge>
                  ) : null}
                </div>
                <div
                  id={metadataId}
                  className="flex min-w-0 flex-col gap-1"
                >
                  <SecuritySessionTimestamp
                    kind="started"
                    locale={locale}
                    template={messages.startedAt}
                    unavailable={messages.unavailable}
                    value={session.createdAt}
                  />
                  <SecuritySessionTimestamp
                    kind="expires"
                    locale={locale}
                    template={messages.expiresAt}
                    unavailable={messages.unavailable}
                    value={session.expires}
                  />
                </div>
              </div>

              <div className="flex min-h-11 min-w-0 w-full items-center sm:w-auto sm:min-w-40 sm:justify-end">
                {session.current ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 min-w-11 w-full whitespace-normal text-center motion-reduce:transition-none sm:w-auto"
                    onClick={() => void endCurrentSession()}
                  >
                    <LogOutIcon data-icon="inline-start" aria-hidden="true" />
                    {messages.signOut}
                  </Button>
                ) : (
                  <SecuritySessionDialog
                    locale={locale}
                    session={session}
                    triggerLabel={messages.revokeSession}
                    messages={messages.dialog}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

    </div>
  );
}
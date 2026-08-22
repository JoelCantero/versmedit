ALTER TYPE "VerificationPurpose" ADD VALUE IF NOT EXISTS 'ACCOUNT_SECURITY';

BEGIN;

ALTER TABLE "Session"
    ADD COLUMN "createdAt" TIMESTAMP(3);

UPDATE "Session"
SET "createdAt" = "authenticatedAt"
WHERE "authenticatedAt" IS NOT NULL;

ALTER TABLE "VerificationToken"
    DROP CONSTRAINT "VerificationToken_signup_snapshot_check";

ALTER TABLE "VerificationToken"
    ADD CONSTRAINT "VerificationToken_signup_snapshot_check"
    CHECK (
        (
            "purpose" = 'LOGIN'
            AND "proposedName" IS NULL
            AND "locale" IS NULL
            AND "termsVersion" IS NULL
            AND "privacyVersion" IS NULL
            AND "acceptedAt" IS NULL
            AND "deliveredAt" IS NULL
        )
        OR
        (
            "purpose" = 'SIGNUP'
            AND "proposedName" IS NOT NULL
            AND "locale" IS NOT NULL
            AND "locale" IN ('en', 'es', 'ca')
            AND "termsVersion" IS NOT NULL
            AND "privacyVersion" IS NOT NULL
            AND "acceptedAt" IS NOT NULL
        )
        OR
        (
            "purpose" = 'ACCOUNT_DELETION'
            AND "proposedName" IS NULL
            AND "locale" IS NOT NULL
            AND "locale" IN ('en', 'es', 'ca')
            AND "termsVersion" IS NULL
            AND "privacyVersion" IS NULL
            AND "acceptedAt" IS NULL
        )
        OR
        (
            "purpose" = 'ACCOUNT_SECURITY'
            AND "proposedName" IS NULL
            AND "locale" IS NOT NULL
            AND "locale" IN ('en', 'es', 'ca')
            AND "termsVersion" IS NULL
            AND "privacyVersion" IS NULL
            AND "acceptedAt" IS NULL
        )
    );

CREATE INDEX "Session_userId_expires_idx"
    ON "Session"("userId", "expires");

WITH ranked_active_sessions AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "userId"
            ORDER BY "createdAt" DESC NULLS LAST, "id" DESC
        ) AS active_rank
    FROM "Session"
    WHERE "expires" > CURRENT_TIMESTAMP
)
DELETE FROM "Session" AS session
USING ranked_active_sessions AS ranked
WHERE session."id" = ranked."id"
  AND ranked.active_rank > 20;

COMMIT;
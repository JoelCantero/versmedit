ALTER TYPE "VerificationPurpose" ADD VALUE IF NOT EXISTS 'ACCOUNT_DATA_EXPORT';

BEGIN;

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
        OR
        (
            "purpose" = 'ACCOUNT_DATA_EXPORT'
            AND "proposedName" IS NULL
            AND "locale" IS NOT NULL
            AND "locale" IN ('en', 'es', 'ca')
            AND "termsVersion" IS NULL
            AND "privacyVersion" IS NULL
            AND "acceptedAt" IS NULL
        )
    );

CREATE TABLE "DataExportAuthorization" (
    "sessionId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataExportAuthorization_pkey" PRIMARY KEY ("sessionId")
);

CREATE INDEX "DataExportAuthorization_expiresAt_idx"
    ON "DataExportAuthorization"("expiresAt");

ALTER TABLE "DataExportAuthorization"
    ADD CONSTRAINT "DataExportAuthorization_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
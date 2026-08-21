ALTER TYPE "VerificationPurpose" ADD VALUE 'ACCOUNT_DELETION';

BEGIN;

ALTER TABLE "Session"
    ADD COLUMN "authenticatedAt" TIMESTAMP(3);

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
            AND "locale" IN ('en', 'es', 'ca')
            AND "termsVersion" IS NOT NULL
            AND "privacyVersion" IS NOT NULL
            AND "acceptedAt" IS NOT NULL
        )
        OR
        (
            "purpose" = 'ACCOUNT_DELETION'
            AND "proposedName" IS NULL
            AND "locale" IN ('en', 'es', 'ca')
            AND "termsVersion" IS NULL
            AND "privacyVersion" IS NULL
            AND "acceptedAt" IS NULL
        )
    );

COMMIT;
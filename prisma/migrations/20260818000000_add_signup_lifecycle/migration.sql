BEGIN;

DO $$
DECLARE
    collision_groups INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER
    INTO collision_groups
    FROM (
        SELECT LOWER(BTRIM("email"))
        FROM "User"
        GROUP BY LOWER(BTRIM("email"))
        HAVING COUNT(*) > 1
    ) AS collisions;

    IF collision_groups > 0 THEN
        RAISE EXCEPTION 'Normalized email collision detected in % group(s)', collision_groups
            USING ERRCODE = '23505';
    END IF;
END
$$;

CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE');
CREATE TYPE "VerificationPurpose" AS ENUM ('LOGIN', 'SIGNUP');

ALTER TABLE "User"
    ADD COLUMN "normalizedEmail" TEXT,
    ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "User"
SET
    "normalizedEmail" = LOWER(BTRIM("email")),
    "status" = 'ACTIVE';

ALTER TABLE "User"
    ALTER COLUMN "normalizedEmail" SET NOT NULL;

CREATE UNIQUE INDEX "User_normalizedEmail_key"
    ON "User"("normalizedEmail");

ALTER TABLE "VerificationToken"
    ADD COLUMN "purpose" "VerificationPurpose" NOT NULL DEFAULT 'LOGIN',
    ADD COLUMN "proposedName" TEXT,
    ADD COLUMN "locale" TEXT,
    ADD COLUMN "termsVersion" TEXT,
    ADD COLUMN "privacyVersion" TEXT,
    ADD COLUMN "acceptedAt" TIMESTAMP(3),
    ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "VerificationToken_token_key"
    ON "VerificationToken"("token");

CREATE INDEX "VerificationToken_identifier_purpose_expires_idx"
    ON "VerificationToken"("identifier", "purpose", "expires");

CREATE UNIQUE INDEX "VerificationToken_signup_identifier_key"
    ON "VerificationToken"("identifier")
    WHERE "purpose" = 'SIGNUP';

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
    );

CREATE TABLE "PolicyAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicyAcceptance_userId_key"
    ON "PolicyAcceptance"("userId");

ALTER TABLE "PolicyAcceptance"
    ADD CONSTRAINT "PolicyAcceptance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
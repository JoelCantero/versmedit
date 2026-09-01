-- AlterTable
ALTER TABLE "VerificationToken" ADD COLUMN     "loginCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "loginCodeHash" TEXT;

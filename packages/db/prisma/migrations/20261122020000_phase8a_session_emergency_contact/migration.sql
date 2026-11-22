-- AlterTable
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip" TEXT,
ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "emergency_contacts" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "emergency_contacts_profileId_idx" ON "emergency_contacts"("profileId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'emergency_contacts_profileId_fkey'
    ) THEN
        ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "care_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

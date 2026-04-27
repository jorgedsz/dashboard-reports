-- CreateTable
CREATE TABLE "TwilioAccount" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "accountSid" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwilioAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'ghl',
ADD COLUMN "twilioAccountId" INTEGER,
ALTER COLUMN "ghlClientId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "TwilioAccount" ADD CONSTRAINT "TwilioAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_twilioAccountId_fkey" FOREIGN KEY ("twilioAccountId") REFERENCES "TwilioAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

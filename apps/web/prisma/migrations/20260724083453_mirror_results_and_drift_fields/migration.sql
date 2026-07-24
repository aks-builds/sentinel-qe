-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN     "isBaseline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "provider" TEXT;

-- AlterTable
ALTER TABLE "TestSuite" ADD COLUMN     "prompts" JSONB;

-- CreateTable
CREATE TABLE "MirrorResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "correctness" INTEGER,
    "relevance" INTEGER,
    "tone" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MirrorResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MirrorResult_runId_idx" ON "MirrorResult"("runId");

-- AddForeignKey
ALTER TABLE "MirrorResult" ADD CONSTRAINT "MirrorResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

import { prisma } from "@/lib/prisma";

export const publicScanLimit = 30;
export const publicScanWindowMs = 60 * 1000;

export async function consumePublicScan(key: string, now = new Date(), db: typeof prisma = prisma) {
  const cutoff = new Date(now.getTime() - publicScanWindowMs);
  await db.$executeRaw`
    INSERT INTO "PublicScanLimit" ("key", "hits", "windowStart")
    VALUES (${key}, 1, ${now})
    ON CONFLICT("key") DO UPDATE SET
      "hits" = CASE
        WHEN "PublicScanLimit"."windowStart" <= ${cutoff} THEN 1
        ELSE "PublicScanLimit"."hits" + 1
      END,
      "windowStart" = CASE
        WHEN "PublicScanLimit"."windowStart" <= ${cutoff} THEN ${now}
        ELSE "PublicScanLimit"."windowStart"
      END
  `;
  const row = await db.publicScanLimit.findUnique({ where: { key } });
  return (row?.hits ?? 0) > publicScanLimit;
}

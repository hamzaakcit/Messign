// Vercel Cron: configure in vercel.json
// {
//   "crons": [{
//     "path": "/api/cron/staleness",
//     "schedule": "0 9 * * 1"
//   }]
// }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const sixMonthsAgo = new Date(Date.now() - SIX_MONTHS_MS);

    const staleDocuments = await prisma.document.findMany({
      where: {
        status: "PUBLISHED",
        updatedAt: { lt: sixMonthsAgo },
      },
      select: { id: true, title: true, authorId: true },
    });

    const notifications = staleDocuments.map((doc) => ({
      userId: doc.authorId,
      type: "CONTENT_STALE" as NotificationType,
      title: "İçerik güncelleme hatırlatması",
      message: `'${doc.title}' dokümanı 6 aydan uzun süredir güncellenmemiş.`,
    }));

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
    }

    return NextResponse.json({
      processed: notifications.length,
      staleDocuments: staleDocuments.length,
    });
  } catch (error) {
    console.error("[api/cron/staleness] GET", error);
    return NextResponse.json(
      { error: "Staleness check failed" },
      { status: 500 }
    );
  }
}

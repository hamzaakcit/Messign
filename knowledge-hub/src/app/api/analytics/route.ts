import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [totalDocuments, documentsByStatus, topViewed, recentSearchCount] =
      await Promise.all([
        prisma.document.count(),

        prisma.document.groupBy({
          by: ["status"],
          _count: { id: true },
        }),

        prisma.document.findMany({
          orderBy: { viewCount: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            slug: true,
            viewCount: true,
            author: { select: { id: true, fullName: true } },
          },
        }),

        prisma.searchLog.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

    return NextResponse.json({
      totalDocuments,
      documentsByStatus: documentsByStatus.map((g) => ({
        status: g.status,
        count: g._count.id,
      })),
      topViewed,
      recentSearchCount,
    });
  } catch (error) {
    console.error("[api/analytics] GET", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();

    if (!q) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const where = {
      OR: [
        { title: { contains: q, mode: "insensitive" as const } },
        { plainText: { contains: q, mode: "insensitive" as const } },
      ],
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          author: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, name: true, slug: true, color: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.document.count({ where }),
    ]);

    return NextResponse.json({ documents, total });
  } catch (error) {
    console.error("[api/search] GET", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}

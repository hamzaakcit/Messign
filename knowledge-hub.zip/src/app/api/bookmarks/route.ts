import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      include: {
        document: {
          include: {
            author: { select: { id: true, fullName: true } },
            category: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(bookmarks);
  } catch {
    return NextResponse.json({ error: "Failed to fetch bookmarks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, documentId } = await request.json();
    if (!userId || !documentId) {
      return NextResponse.json({ error: "userId and documentId required" }, { status: 400 });
    }

    const existing = await prisma.bookmark.findUnique({
      where: { userId_documentId: { userId, documentId } },
    });

    if (existing) {
      await prisma.bookmark.delete({ where: { id: existing.id } });
      return NextResponse.json({ bookmarked: false });
    }

    await prisma.bookmark.create({ data: { userId, documentId } });
    return NextResponse.json({ bookmarked: true });
  } catch {
    return NextResponse.json({ error: "Failed to toggle bookmark" }, { status: 500 });
  }
}

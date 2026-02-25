import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: docId },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const [outgoing, incoming] = await Promise.all([
      prisma.documentLink.findMany({
        where: { sourceId: docId },
        include: {
          target: { select: { id: true, title: true, slug: true, status: true } },
        },
      }),
      prisma.documentLink.findMany({
        where: { targetId: docId },
        include: {
          source: { select: { id: true, title: true, slug: true, status: true } },
        },
      }),
    ]);

    return NextResponse.json({ outgoing, incoming });
  } catch (error) {
    console.error("[api/documents/links] GET", error);
    return NextResponse.json(
      { error: "Failed to fetch document links" },
      { status: 500 }
    );
  }
}

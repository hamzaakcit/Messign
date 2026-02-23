import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateTransition } from "@/lib/workflow/state-machine";
import { DocumentStatus } from "@prisma/client";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;

    const document = await prisma.document.findUnique({
      where: { id: docId },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (!validateTransition(document.status, DocumentStatus.PUBLISHED)) {
      return NextResponse.json(
        {
          error: `Cannot publish a document with status "${document.status}". Only IN_REVIEW documents can be published.`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.document.update({
      where: { id: docId },
      data: {
        status: DocumentStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        category: true,
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[api/documents/publish] POST", error);
    return NextResponse.json(
      { error: "Failed to publish document" },
      { status: 500 }
    );
  }
}

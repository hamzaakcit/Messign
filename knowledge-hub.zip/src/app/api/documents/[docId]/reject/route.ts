import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const { comment, reviewerId } = await request.json();

    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (doc.status !== "IN_REVIEW") {
      return NextResponse.json({ error: "Can only reject documents that are in review" }, { status: 400 });
    }

    const [updated] = await Promise.all([
      prisma.document.update({
        where: { id: docId },
        data: { status: "REJECTED" },
      }),
      prisma.reviewAction.create({
        data: {
          documentId: docId,
          reviewerId: reviewerId || doc.authorId,
          action: "REJECTED",
          comment,
        },
      }),
      prisma.notification.create({
        data: {
          userId: doc.authorId,
          type: "DOCUMENT_REJECTED",
          title: "Doküman Reddedildi",
          message: `"${doc.title}" dokümanınız reddedildi.${comment ? ` Neden: ${comment}` : ""}`,
          link: `/knowledge-hub/documents/${doc.slug}`,
        },
      }),
    ]);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[api/documents/reject]", error);
    return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
  }
}

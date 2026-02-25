import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;

    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (doc.status !== "DRAFT" && doc.status !== "REJECTED") {
      return NextResponse.json({ error: "Can only submit drafts or rejected documents for review" }, { status: 400 });
    }

    const updated = await prisma.document.update({
      where: { id: docId },
      data: { status: "IN_REVIEW" },
    });

    // Create notification for reviewers
    const reviewers = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "CPO", "REVIEWER"] } },
    });

    if (reviewers.length > 0) {
      await prisma.notification.createMany({
        data: reviewers.map((r) => ({
          userId: r.id,
          type: "REVIEW_REQUESTED" as const,
          title: "İnceleme Talebi",
          message: `"${doc.title}" dokümanı incelemenizi bekliyor.`,
          link: `/knowledge-hub/documents/${doc.slug}`,
        })),
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[api/documents/submit-review]", error);
    return NextResponse.json({ error: "Failed to submit for review" }, { status: 500 });
  }
}

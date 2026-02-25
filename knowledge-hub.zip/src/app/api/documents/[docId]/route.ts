import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;

    const document = await prisma.document.findFirst({
      where: { OR: [{ id: docId }, { slug: docId }] },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        category: true,
        tags: { include: { tag: true } },
        attachments: true,
        incomingLinks: {
          include: { source: { select: { id: true, title: true, slug: true } } },
        },
        _count: { select: { comments: true, bookmarks: true, viewLogs: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Increment view count
    await prisma.document.update({
      where: { id: document.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });

    return NextResponse.json(document);
  } catch (error) {
    console.error("[api/documents/id] GET", error);
    return NextResponse.json({ error: "Failed to fetch document" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const body = await request.json();
    const { title, content, documentType, categoryId, tags, isPublic, coverImage, changeNote } = body;

    const existing = await prisma.document.findUnique({ where: { id: docId } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Create version snapshot if published
    if (existing.status === "PUBLISHED") {
      const versionCount = await prisma.documentVersion.count({ where: { documentId: docId } });
      await prisma.documentVersion.create({
        data: {
          documentId: docId,
          content: existing.content as any,
          plainText: existing.plainText,
          version: versionCount + 1,
          changeNote: changeNote || null,
          createdById: existing.authorId,
        },
      });
    }

    const plainText = content ? extractPlainText(content) : existing.plainText;

    const document = await prisma.document.update({
      where: { id: docId },
      data: {
        ...(title && { title }),
        ...(content && { content, plainText, excerpt: plainText?.slice(0, 200) }),
        ...(documentType && { documentType }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(isPublic !== undefined && { isPublic }),
        ...(coverImage !== undefined && { coverImage }),
      },
      include: { author: { select: { id: true, fullName: true } }, category: true },
    });

    // Update tags if provided
    if (tags) {
      await prisma.documentTag.deleteMany({ where: { documentId: docId } });
      if (tags.length > 0) {
        await prisma.documentTag.createMany({
          data: tags.map((tagId: string) => ({ documentId: docId, tagId })),
        });
      }
    }

    return NextResponse.json(document);
  } catch (error) {
    console.error("[api/documents/id] PUT", error);
    return NextResponse.json({ error: "Failed to update document" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    await prisma.document.update({
      where: { id: docId },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}

function extractPlainText(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (content.text) return content.text;
  if (content.content && Array.isArray(content.content)) {
    return content.content.map((node: any) => extractPlainText(node)).join("\n");
  }
  return "";
}

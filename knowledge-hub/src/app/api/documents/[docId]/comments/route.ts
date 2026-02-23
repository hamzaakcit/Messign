import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;

    const comments = await prisma.comment.findMany({
      where: { documentId: docId, parentId: null },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: { select: { id: true, fullName: true, avatarUrl: true } },
          },
        },
      },
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error("[api/documents/comments] GET", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const body = await request.json();
    const { authorId, content, selectionStart, selectionEnd, selectedText, parentId } = body;

    if (!authorId || !content) {
      return NextResponse.json(
        { error: "authorId and content are required" },
        { status: 400 }
      );
    }

    const document = await prisma.document.findUnique({
      where: { id: docId },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
      });
      if (!parent || parent.documentId !== docId) {
        return NextResponse.json(
          { error: "Parent comment not found in this document" },
          { status: 400 }
        );
      }
    }

    const comment = await prisma.comment.create({
      data: {
        documentId: docId,
        authorId,
        content,
        selectionStart: selectionStart ?? null,
        selectionEnd: selectionEnd ?? null,
        selectedText: selectedText ?? null,
        parentId: parentId ?? null,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("[api/documents/comments] POST", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PUBLISHED";
    const categoryId = searchParams.get("categoryId");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const sort = searchParams.get("sort") || "updatedAt";

    const where: any = {};
    if (status !== "all") where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { plainText: { contains: search, mode: "insensitive" } },
      ];
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          author: { select: { id: true, fullName: true, avatarUrl: true } },
          category: { select: { id: true, name: true, slug: true, color: true } },
          tags: { include: { tag: true } },
          _count: { select: { comments: true, bookmarks: true } },
        },
        orderBy: { [sort]: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    return NextResponse.json({ documents, total, page, limit });
  } catch (error) {
    console.error("[api/documents] GET", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      content,
      documentType,
      categoryId,
      tags,
      isPublic,
      authorId,
      coverImage,
    } = body;

    if (!title || !authorId) {
      return NextResponse.json({ error: "Title and authorId are required" }, { status: 400 });
    }

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      + "-" + Date.now().toString(36);

    const plainText = typeof content === "object"
      ? extractPlainText(content)
      : "";

    const excerpt = plainText.slice(0, 200);

    const document = await prisma.document.create({
      data: {
        title,
        slug,
        content: content ?? {},
        plainText,
        excerpt,
        documentType: documentType || "GUIDE",
        categoryId: categoryId || null,
        isPublic: isPublic ?? false,
        authorId,
        coverImage,
        tags: tags?.length
          ? { create: tags.map((tagId: string) => ({ tagId })) }
          : undefined,
      },
      include: {
        author: { select: { id: true, fullName: true } },
        category: true,
        tags: { include: { tag: true } },
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error("[api/documents] POST", error);
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 });
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

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DocumentCard } from "@/components/documents/DocumentCard";
import {
  BookOpen,
  Search,
  TrendingUp,
  Clock,
  Tag,
  FolderTree,
  FileText,
  Eye,
} from "lucide-react";

async function getPopularDocs() {
  try {
    return await prisma.document.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { viewCount: "desc" },
      take: 4,
      include: {
        author: { select: { fullName: true } },
        category: { select: { name: true, color: true } },
        tags: { include: { tag: true } },
      },
    });
  } catch {
    return [];
  }
}

async function getRecentDocs() {
  try {
    return await prisma.document.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        author: { select: { fullName: true } },
        category: { select: { name: true, color: true } },
      },
    });
  } catch {
    return [];
  }
}

async function getCategories() {
  try {
    return await prisma.category.findMany({
      include: { _count: { select: { documents: true } } },
      orderBy: { sortOrder: "asc" },
    });
  } catch {
    return [];
  }
}

async function getTags() {
  try {
    return await prisma.tag.findMany({
      include: { _count: { select: { documents: true } } },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
}

export default async function KnowledgeHubPage() {
  const [popularDocs, recentDocs, categories, tags] = await Promise.all([
    getPopularDocs(),
    getRecentDocs(),
    getCategories(),
    getTags(),
  ]);

  return (
    <div className="p-6 pb-16 max-w-7xl mx-auto space-y-10">
      {/* Hero */}
      <section className="relative rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border p-8 md:p-12">
        <div className="max-w-2xl space-y-4">
          <div className="flex items-center gap-2 text-primary">
            <BookOpen className="w-6 h-6" />
            <span className="text-sm font-medium tracking-wide uppercase">Knowledge Hub</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Hoş geldin
          </h1>
          <p className="text-muted-foreground text-lg">
            Aradığın bilgiyi hızlıca bul, öğren ve paylaş.
          </p>
          <form action="/knowledge-hub/search" method="GET" className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              name="q"
              placeholder="Doküman, rehber veya etiket ara..."
              className="pl-10 h-12 text-base rounded-xl bg-background/80 backdrop-blur-sm"
            />
          </form>
        </div>
      </section>

      {/* Popüler İçerikler */}
      {popularDocs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Popüler İçerikler</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {popularDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={{
                  ...doc,
                  updatedAt: doc.updatedAt.toISOString(),
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Son Güncellenen */}
      {recentDocs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Son Güncellenen</h2>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {recentDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/knowledge-hub/documents/${doc.slug}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/50 transition-colors group"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {doc.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {doc.author?.fullName}
                        {doc.category && (
                          <span
                            className="ml-2"
                            style={{ color: doc.category.color ?? undefined }}
                          >
                            {doc.category.name}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {doc.viewCount}
                      </span>
                      <span>
                        {doc.updatedAt.toLocaleDateString("tr-TR", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Etiket Bulutu & Kategoriler row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Etiket Bulutu */}
        {tags.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Etiket Bulutu</h2>
            </div>
            <Card>
              <CardContent className="flex flex-wrap gap-2 p-5">
                {tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/knowledge-hub/search?q=${encodeURIComponent(tag.name)}`}
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary/10 transition-colors py-1 px-3 text-xs gap-1.5"
                    >
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ backgroundColor: tag.color ?? "#6B7280" }}
                      />
                      {tag.name}
                      <span className="text-muted-foreground">
                        ({tag._count.documents})
                      </span>
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Kategoriler */}
        {categories.length > 0 && (
          <section className="space-y-4 lg:col-span-2">
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Kategoriler</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/knowledge-hub/search?q=${encodeURIComponent(cat.name)}`}
                >
                  <Card className="group hover:shadow-md transition-all duration-200 hover:border-primary/20 py-0 overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex items-center gap-4 p-5">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: (cat.color ?? "#6B7280") + "15" }}
                        >
                          <FolderTree
                            className="w-5 h-5"
                            style={{ color: cat.color ?? "#6B7280" }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                            {cat.name}
                          </h3>
                          {cat.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {cat.description}
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {cat._count.documents} doküman
                        </Badge>
                      </div>
                      <div
                        className="h-0.5"
                        style={{ backgroundColor: cat.color ?? "#6B7280" }}
                      />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

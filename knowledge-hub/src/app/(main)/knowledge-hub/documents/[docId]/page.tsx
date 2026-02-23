import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentTypeBadge } from "@/components/documents/DocumentTypeBadge";
import {
  Eye,
  Clock,
  FileText,
  Tag,
  ArrowLeft,
  Bookmark,
  Link2,
  User,
  List,
} from "lucide-react";

async function getDocument(docId: string) {
  try {
    const doc = await prisma.document.findFirst({
      where: {
        OR: [{ slug: docId }, { id: docId }],
      },
      include: {
        author: { select: { fullName: true, avatarUrl: true } },
        category: { select: { name: true, color: true, slug: true } },
        tags: { include: { tag: true } },
        incomingLinks: {
          include: {
            source: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });
    return doc;
  } catch {
    return null;
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Taslak", variant: "secondary" },
  IN_REVIEW: { label: "İncelemede", variant: "outline" },
  PUBLISHED: { label: "Yayında", variant: "default" },
  ARCHIVED: { label: "Arşivlendi", variant: "secondary" },
  REJECTED: { label: "Reddedildi", variant: "destructive" },
};

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = await params;
  const doc = await getDocument(docId);

  if (!doc) notFound();

  const statusConfig = STATUS_LABELS[doc.status] ?? { label: doc.status, variant: "secondary" as const };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back link */}
      <Link
        href="/knowledge-hub"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Knowledge Hub
      </Link>

      <div className="flex gap-8">
        {/* Main content - 2/3 */}
        <article className="flex-1 min-w-0 space-y-6" style={{ flex: "2" }}>
          {/* Header */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <DocumentTypeBadge type={doc.documentType} />
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              {doc.category && (
                <Badge
                  variant="outline"
                  style={{
                    borderColor: doc.category.color ?? undefined,
                    color: doc.category.color ?? undefined,
                  }}
                >
                  {doc.category.name}
                </Badge>
              )}
            </div>

            <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>

            {doc.excerpt && (
              <p className="text-muted-foreground text-lg leading-relaxed">
                {doc.excerpt}
              </p>
            )}

            <div className="flex items-center gap-4 text-sm text-muted-foreground border-b pb-4">
              <span className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                {doc.author.fullName}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {formatDate(doc.updatedAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                {doc.viewCount} görüntüleme
              </span>
            </div>
          </div>

          {/* Content (pre-formatted JSON for now) */}
          <Card>
            <CardContent className="p-6">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono bg-muted/50 p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(doc.content, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </article>

        {/* Sidebar - 1/3 */}
        <aside className="w-80 shrink-0 space-y-5 hidden lg:block">
          {/* Actions */}
          <Card>
            <CardContent className="p-4">
              <Button variant="outline" className="w-full gap-2">
                <Bookmark className="w-4 h-4" />
                Yer İşaretlerine Ekle
              </Button>
            </CardContent>
          </Card>

          {/* Table of Contents */}
          <Card>
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <List className="w-4 h-4" />
                İçindekiler
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xs text-muted-foreground italic">
                TipTap renderer eklendiğinde otomatik oluşturulacak.
              </p>
            </CardContent>
          </Card>

          {/* Tags */}
          {doc.tags.length > 0 && (
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Etiketler
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex flex-wrap gap-1.5">
                  {doc.tags.map(({ tag }) => (
                    <Link
                      key={tag.id}
                      href={`/knowledge-hub/search?q=${encodeURIComponent(tag.name)}`}
                    >
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary/10 transition-colors text-xs"
                      >
                        {tag.name}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Backlinks */}
          {doc.incomingLinks.length > 0 && (
            <Card>
              <CardHeader className="pb-2 px-4 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  Geri Bağlantılar
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ul className="space-y-2">
                  {doc.incomingLinks.map((link) => (
                    <li key={link.id}>
                      <Link
                        href={`/knowledge-hub/documents/${link.source.slug}`}
                        className="text-sm text-primary hover:underline flex items-center gap-1.5"
                      >
                        <FileText className="w-3 h-3" />
                        {link.source.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Görüntüleme</span>
                <span className="font-medium">{doc.viewCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Oluşturulma</span>
                <span className="font-medium">{formatDate(doc.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Son güncelleme</span>
                <span className="font-medium">{formatDate(doc.updatedAt)}</span>
              </div>
              {doc.publishedAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Yayın tarihi</span>
                  <span className="font-medium">{formatDate(doc.publishedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

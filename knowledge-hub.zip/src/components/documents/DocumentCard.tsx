"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DocumentTypeBadge } from "./DocumentTypeBadge";
import { Eye, Clock, FileText } from "lucide-react";

interface DocumentCardProps {
  document: {
    title: string;
    slug: string;
    excerpt?: string | null;
    documentType: string;
    viewCount: number;
    updatedAt: string | Date;
    author?: { fullName: string } | null;
    category?: { name: string; color?: string | null } | null;
    tags?: { tag: { id: string; name: string; color?: string | null } }[];
  };
}

function formatRelativeDate(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Bugün";
  if (diffDays === 1) return "Dün";
  if (diffDays < 7) return `${diffDays} gün önce`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} hafta önce`;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

export function DocumentCard({ document: doc }: DocumentCardProps) {
  return (
    <Link href={`/knowledge-hub/documents/${doc.slug}`}>
      <Card className="group hover:shadow-md transition-all duration-200 hover:border-primary/20 py-0 overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <DocumentTypeBadge type={doc.documentType} />
              {doc.category && (
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{ borderColor: doc.category.color ?? undefined, color: doc.category.color ?? undefined }}
                >
                  {doc.category.name}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground text-xs shrink-0">
              <Eye className="w-3 h-3" />
              <span>{doc.viewCount}</span>
            </div>
          </div>

          <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-1 mb-1.5">
            {doc.title}
          </h3>

          {doc.excerpt && (
            <p className="text-muted-foreground text-xs line-clamp-2 mb-3 leading-relaxed">
              {doc.excerpt}
            </p>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              {doc.author && (
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {doc.author.fullName}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeDate(doc.updatedAt)}
              </span>
            </div>
          </div>

          {doc.tags && doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {doc.tags.slice(0, 3).map(({ tag }) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                >
                  {tag.name}
                </Badge>
              ))}
              {doc.tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{doc.tags.length - 3}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

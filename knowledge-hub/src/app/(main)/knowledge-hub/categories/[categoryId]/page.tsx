import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { FolderOpen, FileText } from "lucide-react";

interface Props {
  params: Promise<{ categoryId: string }>;
}

async function getCategory(id: string) {
  return prisma.category.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: { updatedAt: "desc" },
        include: {
          author: { select: { fullName: true } },
          category: { select: { name: true, color: true } },
          tags: { include: { tag: true } },
        },
      },
    },
  });
}

export default async function CategoryDetailPage({ params }: Props) {
  const { categoryId } = await params;
  const category = await getCategory(categoryId);

  if (!category) notFound();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Card className="relative overflow-hidden">
        <div
          className="absolute top-0 left-0 w-full h-1.5"
          style={{ backgroundColor: category.color ?? "#6B7280" }}
        />
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: (category.color ?? "#6B7280") + "15" }}
            >
              {category.icon ? (
                <span className="text-xl">{category.icon}</span>
              ) : (
                <FolderOpen
                  className="size-6"
                  style={{ color: category.color ?? "#6B7280" }}
                />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{category.name}</h1>
              {category.description && (
                <p className="text-muted-foreground text-sm mt-1">
                  {category.description}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {category.documents.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="size-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            Bu kategoride henüz doküman bulunmuyor
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {category.documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={{
                title: doc.title,
                slug: doc.slug,
                excerpt: doc.excerpt,
                documentType: doc.documentType,
                viewCount: doc.viewCount,
                updatedAt: doc.updatedAt,
                author: doc.author,
                category: doc.category,
                tags: doc.tags.map((dt) => ({
                  tag: { id: dt.tag.id, name: dt.tag.name, color: dt.tag.color },
                })),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

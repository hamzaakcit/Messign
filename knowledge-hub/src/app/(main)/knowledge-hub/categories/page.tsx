import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, FolderOpen } from "lucide-react";

async function getCategories() {
  return prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { documents: true } },
    },
  });
}

export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Kategoriler</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Tüm doküman kategorilerini görüntüleyin
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="size-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Henüz kategori oluşturulmamış</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Link key={cat.id} href={`/knowledge-hub/categories/${cat.id}`}>
              <Card className="group hover:shadow-md transition-all duration-200 hover:border-primary/20 relative overflow-hidden">
                <div
                  className="absolute top-0 left-0 w-full h-1"
                  style={{ backgroundColor: cat.color ?? "#6B7280" }}
                />
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: (cat.color ?? "#6B7280") + "15" }}
                    >
                      {cat.icon ? (
                        <span className="text-lg">{cat.icon}</span>
                      ) : (
                        <FolderOpen
                          className="size-5"
                          style={{ color: cat.color ?? "#6B7280" }}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-1">
                        {cat.name}
                      </h3>
                      {cat.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                          {cat.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Badge variant="secondary" className="text-xs">
                      <FileText className="size-3" />
                      {cat._count.documents} doküman
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

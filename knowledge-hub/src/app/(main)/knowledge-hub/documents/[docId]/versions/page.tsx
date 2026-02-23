"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, History, FileText } from "lucide-react";

interface Version {
  id: string;
  version: number;
  content: unknown;
  changeNote: string | null;
  createdAt: string;
  createdById: string | null;
}

export default function VersionsPage() {
  const params = useParams<{ docId: string }>();
  const docId = params.docId;

  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVersions() {
      try {
        const res = await fetch(`/api/documents/${docId}/versions`);
        if (res.ok) {
          setVersions(await res.json());
        }
      } catch {
        /* silently fail */
      } finally {
        setLoading(false);
      }
    }

    fetchVersions();
  }, [docId]);

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <Link
        href={`/knowledge-hub/documents/${docId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Dokümana Dön
      </Link>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">Versiyon Geçmişi</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Bu dokümanın tüm versiyonlarını görüntüleyin.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Versiyon bulunamadı</h2>
          <p className="text-muted-foreground text-sm">
            Bu doküman için henüz versiyon kaydı oluşturulmamış.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((version, index) => (
            <Card
              key={version.id}
              className={
                index === 0
                  ? "border-primary/30 bg-primary/[0.02]"
                  : ""
              }
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        v{version.version}
                      </span>
                      {index === 0 && (
                        <Badge variant="default" className="text-[10px]">
                          Güncel
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {version.changeNote || "Değişiklik notu eklenmemiş."}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {formatDate(version.createdAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

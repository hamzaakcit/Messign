"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Users,
  Search,
  Clock,
  CheckSquare,
  AlertTriangle,
} from "lucide-react";

interface Stats {
  totalDocuments: number;
  activeUsers: number;
  weeklySearches: number;
  avgFindTime: string;
}

interface PendingDoc {
  id: string;
  title: string;
  author: string;
  updatedAt: string;
}

const STAT_CARDS = [
  { key: "totalDocuments" as const, label: "Toplam Doküman", icon: FileText, color: "#2563EB" },
  { key: "activeUsers" as const, label: "Aktif Kullanıcılar", icon: Users, color: "#059669" },
  { key: "weeklySearches" as const, label: "Haftalık Arama", icon: Search, color: "#7C3AED" },
  { key: "avgFindTime" as const, label: "Ort. Bulma Süresi", icon: Clock, color: "#F59E0B" },
];

const HEALTH_ITEMS = [
  { label: "Güncel dokümanlar", value: "85%", status: "good" },
  { label: "Eksik etiket", value: "3 doküman", status: "warning" },
  { label: "Eski içerik (>90 gün)", value: "7 doküman", status: "danger" },
  { label: "Ortalama kalite skoru", value: "4.2/5", status: "good" },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalDocuments: 0,
    activeUsers: 0,
    weeklySearches: 0,
    avgFindTime: "—",
  });
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const docs = await res.json();
          const total = Array.isArray(docs) ? docs.length : docs.documents?.length ?? 0;
          const docList = Array.isArray(docs) ? docs : docs.documents ?? [];
          const pending = docList
            .filter((d: { status: string }) => d.status === "IN_REVIEW")
            .map((d: { id: string; title: string; author?: { fullName?: string }; updatedAt: string }) => ({
              id: d.id,
              title: d.title,
              author: d.author?.fullName ?? "Bilinmiyor",
              updatedAt: d.updatedAt,
            }));

          setStats({
            totalDocuments: total,
            activeUsers: 24,
            weeklySearches: 156,
            avgFindTime: "1.2 dk",
          });
          setPendingDocs(pending);
        } else {
          setStats({
            totalDocuments: 0,
            activeUsers: 24,
            weeklySearches: 156,
            avgFindTime: "1.2 dk",
          });
        }
      } catch {
        setStats({
          totalDocuments: 0,
          activeUsers: 24,
          weeklySearches: 156,
          avgFindTime: "1.2 dk",
        });
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const formatStatValue = (key: string, stats: Stats): string => {
    const val = stats[key as keyof Stats];
    if (typeof val === "number") return val.toLocaleString("tr-TR");
    return String(val);
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          İçerik yönetimi ve platform istatistikleri
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((stat) => (
          <Card key={stat.key}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">
                    {loading ? (
                      <span className="inline-block w-16 h-7 bg-muted animate-pulse rounded" />
                    ) : (
                      formatStatValue(stat.key, stats)
                    )}
                  </p>
                </div>
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: stat.color + "15" }}
                >
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Onay Bekleyenler */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-primary" />
              Onay Bekleyenler
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : pendingDocs.length > 0 ? (
              <div className="divide-y">
                {pendingDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">{doc.author}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 ml-3 text-amber-600 border-amber-300">
                      İncelemede
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Bekleyen doküman yok</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* İçerik Sağlığı */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              İçerik Sağlığı
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {HEALTH_ITEMS.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <span
                    className={`text-sm font-medium ${
                      item.status === "good"
                        ? "text-green-600"
                        : item.status === "warning"
                        ? "text-amber-600"
                        : "text-red-600"
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

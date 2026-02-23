"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  HeartPulse,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Clock,
} from "lucide-react";

const HEALTH_STATS = [
  {
    label: "Güncel",
    description: "Son 30 günde güncellenen",
    count: 145,
    total: 234,
    percentage: 62,
    color: "#22C55E",
    icon: CheckCircle2,
  },
  {
    label: "Yaşlanıyor",
    description: "30-90 gündür güncellenmemiş",
    count: 56,
    total: 234,
    percentage: 24,
    color: "#F59E0B",
    icon: AlertTriangle,
  },
  {
    label: "Eski",
    description: "90+ gündür güncellenmemiş",
    count: 33,
    total: 234,
    percentage: 14,
    color: "#EF4444",
    icon: XCircle,
  },
];

const STALE_DOCUMENTS = [
  {
    title: "Legacy API Migration Rehberi",
    author: "Mehmet Kaya",
    lastUpdated: "2024-08-12",
    daysSince: 156,
  },
  {
    title: "Eski Deployment Prosedürleri",
    author: "Ali Öztürk",
    lastUpdated: "2024-09-01",
    daysSince: 136,
  },
  {
    title: "Manual Test Checklist v1",
    author: "Zeynep Çelik",
    lastUpdated: "2024-09-15",
    daysSince: 122,
  },
  {
    title: "İlk Kurulum Rehberi (Deprecated)",
    author: "Ahmet Yılmaz",
    lastUpdated: "2024-10-01",
    daysSince: 106,
  },
  {
    title: "Eski Güvenlik Politikaları",
    author: "Elif Demir",
    lastUpdated: "2024-10-20",
    daysSince: 87,
  },
];

export default function ContentHealthPage() {
  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HeartPulse className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">İçerik Sağlığı</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Doküman güncellik durumu ve içerik kalitesi metrikleri
        </p>
      </div>

      {/* Health status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {HEALTH_STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <stat.icon
                    className="w-5 h-5"
                    style={{ color: stat.color }}
                  />
                  <div>
                    <p className="text-sm font-medium">{stat.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {stat.description}
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-bold">{stat.count}</span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${stat.percentage}%`,
                      backgroundColor: stat.color,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{stat.percentage}%</span>
                  <span>{stat.count} / {stat.total}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overall health bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Genel Durum</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full h-4 bg-muted rounded-full overflow-hidden flex">
            {HEALTH_STATS.map((stat) => (
              <div
                key={stat.label}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${stat.percentage}%`,
                  backgroundColor: stat.color,
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-6 mt-3">
            {HEALTH_STATS.map((stat) => (
              <div key={stat.label} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: stat.color }}
                />
                <span className="text-xs text-muted-foreground">
                  {stat.label} ({stat.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stale documents list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-500" />
            Eski Dokümanlar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            90 günden fazla süredir güncellenmemiş dokümanlar. Gözden geçirmeyi değerlendirin.
          </p>
          <div className="space-y-3">
            {STALE_DOCUMENTS.map((doc) => (
              <div
                key={doc.title}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {doc.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {doc.author} &middot;{" "}
                      {new Date(doc.lastUpdated).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={doc.daysSince > 120 ? "destructive" : "secondary"}
                  className="shrink-0 ml-3"
                >
                  {doc.daysSince} gün
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, TrendingUp, AlertCircle, BarChart3 } from "lucide-react";

const SEARCH_TRENDS = [
  { term: "API entegrasyon", count: 145, trend: "+12%" },
  { term: "onboarding", count: 98, trend: "+5%" },
  { term: "deployment", count: 87, trend: "-3%" },
  { term: "veritabanı", count: 76, trend: "+8%" },
  { term: "güvenlik", count: 65, trend: "+15%" },
  { term: "CI/CD", count: 54, trend: "+2%" },
  { term: "docker", count: 48, trend: "+20%" },
  { term: "monitoring", count: 42, trend: "-1%" },
];

const FAILED_SEARCHES = [
  { term: "kubernetes helm chart", count: 23, date: "2025-01-15" },
  { term: "graphql subscription", count: 18, date: "2025-01-14" },
  { term: "redis cache invalidation", count: 15, date: "2025-01-14" },
  { term: "terraform modules", count: 12, date: "2025-01-13" },
  { term: "websocket authentication", count: 9, date: "2025-01-12" },
];

export default function SearchAnalyticsPage() {
  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">Arama Analitikleri</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Arama trendleri ve başarısız aramalar
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Toplam Arama</p>
            <p className="text-2xl font-bold mt-1">2,847</p>
            <p className="text-xs text-green-600 mt-1">Bu hafta +156</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Başarı Oranı</p>
            <p className="text-2xl font-bold mt-1">87.3%</p>
            <p className="text-xs text-green-600 mt-1">+2.1%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Ort. Sonuç Süresi</p>
            <p className="text-2xl font-bold mt-1">0.8 sn</p>
            <p className="text-xs text-green-600 mt-1">-0.1 sn</p>
          </CardContent>
        </Card>
      </div>

      {/* Search trend chart placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Arama Trendleri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center bg-muted/30 rounded-lg border border-dashed mb-6">
            <div className="text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Grafik bileşeni eklendiğinde trend gösterilecek.
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arama Terimi</TableHead>
                <TableHead className="text-right">Arama Sayısı</TableHead>
                <TableHead className="text-right">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SEARCH_TRENDS.map((item) => (
                <TableRow key={item.term}>
                  <TableCell className="font-medium text-sm">
                    {item.term}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {item.count}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`text-xs font-medium ${item.trend.startsWith("+") ? "text-green-600" : "text-red-600"}`}
                    >
                      {item.trend}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Failed searches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            Başarısız Aramalar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Sonuç bulunamayan en sık aranan terimler. Bu konularda doküman oluşturmayı değerlendirin.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arama Terimi</TableHead>
                <TableHead className="text-right">Tekrar Sayısı</TableHead>
                <TableHead className="text-right">Son Arama</TableHead>
                <TableHead className="text-right">Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FAILED_SEARCHES.map((item) => (
                <TableRow key={item.term}>
                  <TableCell className="font-medium text-sm">
                    {item.term}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {item.count}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {new Date(item.date).toLocaleDateString("tr-TR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="destructive" className="text-[10px]">
                      Sonuç yok
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

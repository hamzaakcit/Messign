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
import {
  BarChart3,
  Eye,
  FileText,
  Users,
  TrendingUp,
  Activity,
} from "lucide-react";

const STAT_CARDS = [
  { label: "Toplam Görüntüleme", value: "12,458", icon: Eye, color: "#2563EB", change: "+12%" },
  { label: "Toplam Doküman", value: "234", icon: FileText, color: "#059669", change: "+8" },
  { label: "Aktif Kullanıcılar", value: "156", icon: Users, color: "#7C3AED", change: "+23%" },
  { label: "Ort. Oturum Süresi", value: "4.2 dk", icon: Activity, color: "#F59E0B", change: "+5%" },
];

const TOP_DOCUMENTS = [
  { title: "API Entegrasyon Rehberi", views: 1284, author: "Ahmet Yılmaz" },
  { title: "Yeni Çalışan Onboarding", views: 956, author: "Elif Demir" },
  { title: "Veritabanı Yönetim Kılavuzu", views: 847, author: "Mehmet Kaya" },
  { title: "CI/CD Pipeline Kurulumu", views: 723, author: "Zeynep Çelik" },
  { title: "Güvenlik Politikaları", views: 654, author: "Ali Öztürk" },
];

const TOP_CONTRIBUTORS = [
  { name: "Ahmet Yılmaz", documents: 23, views: 4521 },
  { name: "Elif Demir", documents: 18, views: 3845 },
  { name: "Mehmet Kaya", documents: 15, views: 2967 },
  { name: "Zeynep Çelik", documents: 12, views: 2340 },
  { name: "Ali Öztürk", documents: 10, views: 1876 },
];

export default function AnalyticsDashboardPage() {
  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">Analitik Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Platform kullanım istatistikleri ve içerik performansı
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-green-600">{stat.change}</p>
                </div>
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: stat.color + "15" }}
                >
                  <stat.icon
                    className="w-5 h-5"
                    style={{ color: stat.color }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Görüntüleme Trendi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center bg-muted/30 rounded-lg border border-dashed">
            <div className="text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Grafik bileşeni eklendiğinde burada görüntüleme trendi gösterilecek.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* En Çok Okunanlar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              En Çok Okunanlar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doküman</TableHead>
                  <TableHead>Yazar</TableHead>
                  <TableHead className="text-right">Görüntüleme</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TOP_DOCUMENTS.map((doc) => (
                  <TableRow key={doc.title}>
                    <TableCell className="font-medium text-sm">
                      {doc.title}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.author}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {doc.views.toLocaleString("tr-TR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top Contributors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Top Contributors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead className="text-right">Doküman</TableHead>
                  <TableHead className="text-right">Görüntüleme</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TOP_CONTRIBUTORS.map((user) => (
                  <TableRow key={user.name}>
                    <TableCell className="font-medium text-sm">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {user.documents}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {user.views.toLocaleString("tr-TR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  FolderTree,
  Tags,
  FileText,
  CheckSquare,
  GitBranch,
  Users,
  Shield,
  Building2,
  TrendingUp,
  Search,
  HeartPulse,
  Trophy,
  ScrollText,
  Settings,
  Link2,
  ArrowLeft,
  BookOpen,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "İÇERİK YÖNETİMİ",
    items: [
      { label: "Kategoriler", href: "/admin/categories", icon: FolderTree },
      { label: "Etiketler", href: "/admin/categories?tab=tags", icon: Tags },
      { label: "Tüm Dokümanlar", href: "/admin/categories?tab=docs", icon: FileText },
      { label: "Onay Bekleyenler", href: "/admin/workflows", icon: CheckSquare },
      { label: "Workflow Yönetimi", href: "/admin/workflows?tab=config", icon: GitBranch },
    ],
  },
  {
    label: "KULLANICI YÖNETİMİ",
    items: [
      { label: "Kullanıcılar", href: "/admin/users", icon: Users },
      { label: "Roller & İzinler", href: "/admin/roles", icon: Shield },
      { label: "Takımlar", href: "/admin/teams", icon: Building2 },
    ],
  },
  {
    label: "ANALİTİK",
    items: [
      { label: "Genel Analitik", href: "/admin/analytics", icon: TrendingUp },
      { label: "Arama Trendleri", href: "/admin/analytics/search-analytics", icon: Search },
      { label: "İçerik Sağlığı", href: "/admin/analytics/content-health", icon: HeartPulse },
      { label: "Top Contributors", href: "/admin/analytics?tab=contributors", icon: Trophy },
    ],
  },
  {
    label: "SİSTEM",
    items: [
      { label: "Denetim Kayıtları", href: "/admin/audit-log", icon: ScrollText },
      { label: "Ayarlar", href: "/admin/settings", icon: Settings },
      { label: "Entegrasyonlar", href: "/admin/settings?tab=integrations", icon: Link2 },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-background flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-sm">Messign Admin</p>
            <p className="text-[11px] text-muted-foreground">Yönetim Paneli</p>
          </div>
        </div>
      </div>

      {/* Dashboard */}
      <div className="px-3 pt-3">
        <Link
          href="/admin"
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
            pathname === "/admin"
              ? "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          <BarChart3 className="w-4 h-4" />
          Dashboard
        </Link>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
              {section.label}
            </p>
            <nav className="space-y-0.5">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
                    pathname === item.href
                      ? "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-l-2 border-violet-600"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        ))}
      </div>

      {/* Back to Main */}
      <div className="border-t p-3">
        <Link
          href="/knowledge-hub"
          className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Ana Panele Dön
        </Link>
      </div>
    </aside>
  );
}

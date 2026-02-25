"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  BookOpen,
  Search,
  FolderTree,
  Star,
  Clock,
  FileEdit,
  Bot,
  Library,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  LogOut,
  Shield,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  children?: Category[];
}

const NAV_ITEMS = [
  { label: "Knowledge Hub", href: "/knowledge-hub", icon: BookOpen },
  { label: "Arama", href: "/knowledge-hub/search", icon: Search },
];

const QUICK_ACCESS = [
  { label: "Favorilerim", href: "/knowledge-hub/collections", icon: Star },
  { label: "Son Görüntülenen", href: "/knowledge-hub?tab=recent", icon: Clock },
  { label: "Taslaklar", href: "/knowledge-hub?tab=drafts", icon: FileEdit },
];

const EXTRAS = [
  { label: "AI Asistan", href: "/knowledge-hub/ai-assistant", icon: Bot },
  { label: "Koleksiyonlar", href: "/knowledge-hub/collections", icon: Library },
];

function CategoryTree({ categories }: { categories: Category[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function renderCategory(cat: Category, depth = 0) {
    const hasChildren = cat.children && cat.children.length > 0;
    const isOpen = expanded.has(cat.id);

    return (
      <div key={cat.id}>
        <Link
          href={`/knowledge-hub/categories/${cat.id}`}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors group",
            depth > 0 && "ml-4"
          )}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.preventDefault();
                toggle(cat.id);
              }}
              className="p-0.5"
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
          )}
          {!hasChildren && <span className="w-4" />}
          <FolderTree
            className="w-4 h-4 shrink-0"
            style={{ color: cat.color ?? undefined }}
          />
          <span className="truncate">{cat.name}</span>
        </Link>
        {hasChildren && isOpen && (
          <div>
            {cat.children!.map((child) => renderCategory(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return <div className="space-y-0.5">{categories.map((c) => renderCategory(c))}</div>;
}

function SidebarContent({
  categories,
  collapsed,
  onToggle,
  userEmail,
}: {
  categories: Category[];
  collapsed: boolean;
  onToggle: () => void;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (collapsed) {
    return (
      <div className="h-full flex flex-col items-center py-4 gap-2">
        <Link
          href="/knowledge-hub"
          className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center mb-4"
        >
          <BookOpen className="w-5 h-5 text-white" />
        </Link>
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <PanelLeftOpen className="w-4 h-4" />
        </Button>
        <div className="flex-1" />
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                pathname === item.href && "bg-accent text-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
            </Button>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b">
        <Link href="/knowledge-hub" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm">Messign</span>
        </Link>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
          <PanelLeftClose className="w-4 h-4" />
        </Button>
      </div>

      {/* Search shortcut */}
      <div className="px-3 py-3">
        <Button
          variant="outline"
          className="w-full justify-start text-muted-foreground gap-2 h-9 text-sm"
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        >
          <Search className="w-4 h-4" />
          <span>Ara...</span>
          <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 space-y-6">
        {/* Navigation */}
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
                pathname === item.href
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-l-2 border-blue-600"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Categories */}
        {categories.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
              Kategoriler
            </p>
            <CategoryTree categories={categories} />
          </div>
        )}

        {/* Quick Access */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Hızlı Erişim
          </p>
          <nav className="space-y-0.5">
            {QUICK_ACCESS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Extras */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Ekstra
          </p>
          <nav className="space-y-0.5">
            {EXTRAS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* User Profile */}
      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-accent transition-colors text-left">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                  {userEmail?.charAt(0).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {userEmail ?? "Kullanıcı"}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/admin" className="gap-2">
                <Shield className="w-4 h-4" />
                Yönetim Paneli
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <Settings className="w-4 h-4" />
              Ayarlar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-red-600">
              <LogOut className="w-4 h-4" />
              Çıkış Yap
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function MainSidebar({
  categories = [],
  userEmail,
}: {
  categories?: Category[];
  userEmail?: string;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-r bg-background transition-all duration-200",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent
          categories={categories}
          collapsed={collapsed}
          onToggle={toggle}
          userEmail={userEmail}
        />
      </aside>

      {/* Mobile sidebar */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <SidebarContent
              categories={categories}
              collapsed={false}
              onToggle={() => {}}
              userEmail={userEmail}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

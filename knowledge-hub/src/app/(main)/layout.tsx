import { MainSidebar } from "@/components/layout/MainSidebar";
import { BreadcrumbNav } from "@/components/layout/BreadcrumbNav";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function getCategories() {
  try {
    return await prisma.category.findMany({
      where: { parentId: null },
      include: { children: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
  } catch {
    return [];
  }
}

async function getUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, user] = await Promise.all([
    getCategories(),
    getUser(),
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MainSidebar
        categories={categories}
        userEmail={user?.email}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b px-6 py-3 flex items-center gap-4 shrink-0">
          <BreadcrumbNav />
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}

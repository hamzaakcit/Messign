import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed categories
  const categories = [
    { name: "Teknik", slug: "teknik", icon: "Code", color: "#2563EB", sortOrder: 0, description: "Teknik dokümanlar ve rehberler" },
    { name: "İK & Politikalar", slug: "ik-politikalar", icon: "Users", color: "#7C3AED", sortOrder: 1, description: "İnsan kaynakları ve şirket politikaları" },
    { name: "Satış & Pazarlama", slug: "satis-pazarlama", icon: "TrendingUp", color: "#10B981", sortOrder: 2, description: "Satış ve pazarlama materyalleri" },
    { name: "Tasarım", slug: "tasarim", icon: "Palette", color: "#F59E0B", sortOrder: 3, description: "Tasarım kılavuzları ve kaynaklar" },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log("Categories seeded");

  // Seed tags
  const tags = [
    { name: "react", slug: "react", color: "#61DAFB" },
    { name: "onboarding", slug: "onboarding", color: "#10B981" },
    { name: "api", slug: "api", color: "#2563EB" },
    { name: "security", slug: "security", color: "#EF4444" },
    { name: "hr", slug: "hr", color: "#7C3AED" },
    { name: "design-system", slug: "design-system", color: "#F59E0B" },
    { name: "deployment", slug: "deployment", color: "#6366F1" },
    { name: "best-practices", slug: "best-practices", color: "#14B8A6" },
  ];

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: tag,
    });
  }
  console.log("Tags seeded");

  // Seed admin user
  await prisma.user.upsert({
    where: { email: "admin@messign.com" },
    update: {},
    create: {
      email: "admin@messign.com",
      fullName: "Admin User",
      role: "ADMIN",
    },
  });
  console.log("Admin user seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";

const LABELS: Record<string, string> = {
  "knowledge-hub": "Knowledge Hub",
  search: "Arama",
  categories: "Kategoriler",
  documents: "Dokümanlar",
  new: "Yeni",
  edit: "Düzenle",
  versions: "Sürümler",
  collections: "Koleksiyonlar",
  "ai-assistant": "AI Asistan",
  admin: "Admin",
  users: "Kullanıcılar",
  roles: "Roller",
  teams: "Takımlar",
  workflows: "Workflow",
  analytics: "Analitik",
  "audit-log": "Denetim",
  settings: "Ayarlar",
};

export function BreadcrumbNav() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length <= 1) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const href = "/" + segments.slice(0, index + 1).join("/");
          const isLast = index === segments.length - 1;
          const label = LABELS[segment] ?? decodeURIComponent(segment);

          return (
            <Fragment key={href}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

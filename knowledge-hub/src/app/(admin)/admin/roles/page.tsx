"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Crown,
  Pencil,
  Eye,
  CheckCircle,
} from "lucide-react";

interface RoleDefinition {
  name: string;
  key: string;
  description: string;
  icon: React.ElementType;
  color: string;
  badgeClass: string;
  permissions: string[];
}

const ROLES: RoleDefinition[] = [
  {
    name: "Admin",
    key: "ADMIN",
    description: "Tam yetki - tüm sistem kontrolü",
    icon: Shield,
    color: "#EF4444",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    permissions: [
      "Kullanıcı yönetimi",
      "Rol ve izin atama",
      "Sistem ayarları",
      "Tüm içerikleri yönetme",
      "Audit log görüntüleme",
      "Takım yönetimi",
    ],
  },
  {
    name: "CPO",
    key: "CPO",
    description: "İçerik yönetimi ve onay yetkisi",
    icon: Crown,
    color: "#8B5CF6",
    badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
    permissions: [
      "İçerik onaylama / reddetme",
      "Kategori yönetimi",
      "Etiket yönetimi",
      "Yayın kontrolü",
      "Analitik görüntüleme",
    ],
  },
  {
    name: "Editor",
    key: "EDITOR",
    description: "Doküman oluşturma ve düzenleme",
    icon: Pencil,
    color: "#3B82F6",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    permissions: [
      "Doküman oluşturma",
      "Doküman düzenleme",
      "Taslak yönetimi",
      "Dosya yükleme",
      "Yorum ekleme",
    ],
  },
  {
    name: "Reviewer",
    key: "REVIEWER",
    description: "İçerik inceleme ve onaylama",
    icon: CheckCircle,
    color: "#10B981",
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    permissions: [
      "Doküman inceleme",
      "Yorum ekleme",
      "Onay / red verme",
      "İçerik kalite kontrolü",
    ],
  },
  {
    name: "Viewer",
    key: "VIEWER",
    description: "Sadece okuma yetkisi",
    icon: Eye,
    color: "#6B7280",
    badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    permissions: [
      "Doküman okuma",
      "Arama yapma",
      "Yer imi ekleme",
      "Koleksiyon oluşturma",
    ],
  },
];

export default function RolesPage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Roller ve Yetkiler</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Sistemdeki roller ve her role atanmış izinler
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {ROLES.map((role) => (
          <Card key={role.key} className="relative overflow-hidden">
            <div
              className="absolute top-0 left-0 w-full h-1"
              style={{ backgroundColor: role.color }}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: role.color + "15" }}
                  >
                    <role.icon className="size-4" style={{ color: role.color }} />
                  </div>
                  <div>
                    <CardTitle className="text-base">{role.name}</CardTitle>
                  </div>
                </div>
                <Badge variant="secondary" className={role.badgeClass}>
                  {role.key}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {role.description}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                İzinler
              </p>
              <ul className="space-y-1.5">
                {role.permissions.map((perm) => (
                  <li
                    key={perm}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <CheckCircle
                      className="size-3.5 shrink-0"
                      style={{ color: role.color }}
                    />
                    {perm}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

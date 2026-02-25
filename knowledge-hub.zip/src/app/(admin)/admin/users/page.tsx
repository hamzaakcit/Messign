"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, MoreHorizontal } from "lucide-react";

type Role = "ADMIN" | "CPO" | "EDITOR" | "REVIEWER" | "VIEWER";

interface MockUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  team: string;
  createdAt: string;
}

const ROLE_STYLES: Record<Role, { label: string; className: string }> = {
  ADMIN: { label: "Admin", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  CPO: { label: "CPO", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400" },
  EDITOR: { label: "Editor", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  REVIEWER: { label: "Reviewer", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  VIEWER: { label: "Viewer", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
};

const MOCK_USERS: MockUser[] = [
  { id: "1", fullName: "Ahmet Yılmaz", email: "ahmet@messign.com", role: "ADMIN", team: "Platform", createdAt: "2024-01-15" },
  { id: "2", fullName: "Elif Demir", email: "elif@messign.com", role: "CPO", team: "İçerik", createdAt: "2024-02-20" },
  { id: "3", fullName: "Mehmet Kaya", email: "mehmet@messign.com", role: "EDITOR", team: "Dokümantasyon", createdAt: "2024-03-10" },
  { id: "4", fullName: "Zeynep Arslan", email: "zeynep@messign.com", role: "REVIEWER", team: "Kalite", createdAt: "2024-04-05" },
  { id: "5", fullName: "Can Öztürk", email: "can@messign.com", role: "VIEWER", team: "Destek", createdAt: "2024-05-18" },
  { id: "6", fullName: "Ayşe Çelik", email: "ayse@messign.com", role: "EDITOR", team: "İçerik", createdAt: "2024-06-22" },
  { id: "7", fullName: "Burak Şahin", email: "burak@messign.com", role: "VIEWER", team: "Platform", createdAt: "2024-07-30" },
];

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function UsersPage() {
  const [users] = useState<MockUser[]>(MOCK_USERS);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kullanıcı Yönetimi</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sistemdeki tüm kullanıcıları görüntüleyin ve yönetin
          </p>
        </div>
        <Button>
          <Plus className="size-4" />
          Yeni Kullanıcı
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kullanıcı</TableHead>
              <TableHead>E-posta</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Takım</TableHead>
              <TableHead>Oluşturulma</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const roleStyle = ROLE_STYLES[user.role];
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar size="sm">
                        <AvatarFallback className="text-xs">
                          {getInitials(user.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.fullName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={roleStyle.className}>
                      {roleStyle.label}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.team}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-xs">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

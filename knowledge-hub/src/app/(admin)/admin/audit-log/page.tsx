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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, UserPlus, Settings, Trash2, Eye, Edit } from "lucide-react";

type ActionType = "CREATE" | "UPDATE" | "DELETE" | "VIEW" | "SETTINGS" | "USER";

interface AuditEntry {
  id: string;
  date: string;
  user: string;
  action: ActionType;
  entity: string;
  details: string;
}

const ACTION_CONFIG: Record<ActionType, { label: string; icon: React.ElementType; className: string }> = {
  CREATE: { label: "Oluşturma", icon: FileText, className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  UPDATE: { label: "Güncelleme", icon: Edit, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  DELETE: { label: "Silme", icon: Trash2, className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  VIEW: { label: "Görüntüleme", icon: Eye, className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
  SETTINGS: { label: "Ayar Değişikliği", icon: Settings, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  USER: { label: "Kullanıcı İşlemi", icon: UserPlus, className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400" },
};

const MOCK_ENTRIES: AuditEntry[] = [
  { id: "1", date: "2025-02-20T14:32:00", user: "Ahmet Yılmaz", action: "CREATE", entity: "Doküman", details: "\"API Entegrasyon Kılavuzu\" oluşturuldu" },
  { id: "2", date: "2025-02-20T13:15:00", user: "Elif Demir", action: "UPDATE", entity: "Kategori", details: "\"Teknik Dökümanlar\" kategorisi güncellendi" },
  { id: "3", date: "2025-02-20T12:45:00", user: "Mehmet Kaya", action: "DELETE", entity: "Doküman", details: "\"Eski Kurulum Rehberi\" silindi" },
  { id: "4", date: "2025-02-20T11:30:00", user: "Ahmet Yılmaz", action: "USER", entity: "Kullanıcı", details: "Yeni kullanıcı \"can@messign.com\" eklendi" },
  { id: "5", date: "2025-02-20T10:20:00", user: "Zeynep Arslan", action: "UPDATE", entity: "Doküman", details: "\"Başlangıç Rehberi\" onaylandı" },
  { id: "6", date: "2025-02-19T17:45:00", user: "Ahmet Yılmaz", action: "SETTINGS", entity: "Sistem", details: "E-posta bildirim ayarları güncellendi" },
  { id: "7", date: "2025-02-19T16:10:00", user: "Can Öztürk", action: "VIEW", entity: "Doküman", details: "\"Güvenlik Politikası\" görüntülendi" },
  { id: "8", date: "2025-02-19T15:00:00", user: "Ayşe Çelik", action: "CREATE", entity: "Doküman", details: "\"Onboarding Süreci\" oluşturuldu" },
  { id: "9", date: "2025-02-19T14:20:00", user: "Elif Demir", action: "UPDATE", entity: "Takım", details: "\"İçerik\" takımına yeni üye eklendi" },
  { id: "10", date: "2025-02-19T11:05:00", user: "Burak Şahin", action: "VIEW", entity: "Doküman", details: "\"Deployment Rehberi\" görüntülendi" },
];

export default function AuditLogPage() {
  const [filter, setFilter] = useState<string>("ALL");

  const filteredEntries =
    filter === "ALL"
      ? MOCK_ENTRIES
      : MOCK_ENTRIES.filter((e) => e.action === filter);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Denetim Günlüğü</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sistemdeki tüm işlemleri takip edin
          </p>
        </div>

        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tümü" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm İşlemler</SelectItem>
            <SelectItem value="CREATE">Oluşturma</SelectItem>
            <SelectItem value="UPDATE">Güncelleme</SelectItem>
            <SelectItem value="DELETE">Silme</SelectItem>
            <SelectItem value="VIEW">Görüntüleme</SelectItem>
            <SelectItem value="SETTINGS">Ayar Değişikliği</SelectItem>
            <SelectItem value="USER">Kullanıcı İşlemi</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarih</TableHead>
              <TableHead>Kullanıcı</TableHead>
              <TableHead>İşlem</TableHead>
              <TableHead>Varlık</TableHead>
              <TableHead>Detay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Bu filtre için kayıt bulunamadı.
                </TableCell>
              </TableRow>
            ) : (
              filteredEntries.map((entry) => {
                const config = ACTION_CONFIG[entry.action];
                const ActionIcon = config.icon;
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(entry.date).toLocaleString("tr-TR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">{entry.user}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={config.className}>
                        <ActionIcon className="size-3" />
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell>{entry.entity}</TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                      {entry.details}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

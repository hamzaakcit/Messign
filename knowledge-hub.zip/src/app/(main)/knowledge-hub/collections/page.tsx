"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FolderOpen, Plus, FileText, Calendar } from "lucide-react";

interface Collection {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  createdAt: string;
}

const PLACEHOLDER_COLLECTIONS: Collection[] = [
  {
    id: "1",
    name: "Onboarding Rehberleri",
    description: "Yeni çalışanlar için hazırlanan dokümanlar",
    documentCount: 8,
    createdAt: "2025-01-10T10:00:00Z",
  },
  {
    id: "2",
    name: "API Referansları",
    description: "Tüm API entegrasyon dokümanları",
    documentCount: 12,
    createdAt: "2025-01-05T14:30:00Z",
  },
  {
    id: "3",
    name: "DevOps Playbook",
    description: "Deployment ve altyapı dokümanları",
    documentCount: 5,
    createdAt: "2024-12-20T09:15:00Z",
  },
];

export default function CollectionsPage() {
  const [collections, setCollections] =
    useState<Collection[]>(PLACEHOLDER_COLLECTIONS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;

    const newCollection: Collection = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      description: newDescription.trim(),
      documentCount: 0,
      createdAt: new Date().toISOString(),
    };

    setCollections((prev) => [newCollection, ...prev]);
    setNewName("");
    setNewDescription("");
    setDialogOpen(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold">Koleksiyonlar</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Dokümanlarınızı koleksiyonlar halinde düzenleyin.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Yeni Koleksiyon
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Koleksiyon</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Ad</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Koleksiyon adı"
                />
              </div>
              <div>
                <Label>Açıklama</Label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Kısa açıklama (opsiyonel)"
                />
              </div>
              <Button onClick={handleCreate} className="w-full">
                Oluştur
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {collections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Henüz koleksiyon yok</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            Dokümanlarınızı düzenlemek için ilk koleksiyonunuzu oluşturun.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {collections.map((collection) => (
            <Card
              key={collection.id}
              className="group hover:shadow-md transition-all duration-200 hover:border-primary/20 cursor-pointer"
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FolderOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
                      {collection.name}
                    </h3>
                    {collection.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {collection.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {collection.documentCount} doküman
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(collection.createdAt).toLocaleDateString(
                          "tr-TR",
                          { day: "numeric", month: "short", year: "numeric" }
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, FolderTree, Tags } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  sortOrder: number;
  _count?: { documents: number };
}

interface Tag {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  _count?: { documents: number };
}

export default function CategoriesAdminPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#2563EB");
  const [newCatIcon, setNewCatIcon] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#2563EB");
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);

  const fetchData = async () => {
    const [catRes, tagRes] = await Promise.all([
      fetch("/api/categories"),
      fetch("/api/tags"),
    ]);
    if (catRes.ok) setCategories(await catRes.json());
    if (tagRes.ok) setTags(await tagRes.json());
  };

  useEffect(() => {
    fetchData();
  }, []);

  const createCategory = async () => {
    if (!newCatName.trim()) return;
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName, color: newCatColor, icon: newCatIcon || null }),
    });
    if (res.ok) {
      toast.success("Kategori oluşturuldu");
      setNewCatName("");
      setCatDialogOpen(false);
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Hata oluştu");
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Bu kategoriyi silmek istediğinize emin misiniz?")) return;
    const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Kategori silindi");
      fetchData();
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName, color: newTagColor }),
    });
    if (res.ok) {
      toast.success("Etiket oluşturuldu");
      setNewTagName("");
      setTagDialogOpen(false);
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || "Hata oluştu");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Kategori & Etiket Yönetimi</h1>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories" className="gap-2">
            <FolderTree className="w-4 h-4" />
            Kategoriler
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-2">
            <Tags className="w-4 h-4" />
            Etiketler
          </TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Yeni Kategori
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Yeni Kategori</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Ad</Label>
                    <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Kategori adı" />
                  </div>
                  <div>
                    <Label>İkon (Lucide)</Label>
                    <Input value={newCatIcon} onChange={(e) => setNewCatIcon(e.target.value)} placeholder="Code, Users, TrendingUp..." />
                  </div>
                  <div>
                    <Label>Renk</Label>
                    <Input type="color" value={newCatColor} onChange={(e) => setNewCatColor(e.target.value)} />
                  </div>
                  <Button onClick={createCategory} className="w-full">Oluştur</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Renk</TableHead>
                <TableHead>Doküman</TableHead>
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-muted-foreground">{cat.slug}</TableCell>
                  <TableCell>
                    <div className="w-6 h-6 rounded" style={{ backgroundColor: cat.color ?? "#ccc" }} />
                  </TableCell>
                  <TableCell>{cat._count?.documents ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteCategory(cat.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Henüz kategori yok
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Yeni Etiket
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Yeni Etiket</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Ad</Label>
                    <Input value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="Etiket adı" />
                  </div>
                  <div>
                    <Label>Renk</Label>
                    <Input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} />
                  </div>
                  <Button onClick={createTag} className="w-full">Oluştur</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-sm py-1 px-3 gap-1"
                style={{ borderColor: tag.color ?? undefined }}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color ?? "#ccc" }} />
                {tag.name}
                <span className="text-muted-foreground ml-1">({tag._count?.documents ?? 0})</span>
              </Badge>
            ))}
            {tags.length === 0 && (
              <p className="text-muted-foreground text-sm">Henüz etiket yok</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

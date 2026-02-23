"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { JSONContent } from "@tiptap/react";
import { TipTapEditor } from "@/components/editor/TipTapEditor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Send, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

interface Tag {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
}

const DOCUMENT_TYPES = [
  { value: "GUIDE", label: "Rehber" },
  { value: "FAQ", label: "SSS" },
  { value: "SPECIFICATION", label: "Spesifikasyon" },
  { value: "ROADMAP", label: "Yol Haritası" },
  { value: "MEETING_NOTE", label: "Toplantı Notu" },
  { value: "MICRO_LEARN", label: "Mikro Öğrenme" },
  { value: "ANNOUNCEMENT", label: "Duyuru" },
  { value: "TEMPLATE", label: "Şablon" },
  { value: "SOP", label: "SOP" },
] as const;

export default function NewDocumentPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<JSONContent | undefined>();
  const [documentType, setDocumentType] = useState("GUIDE");
  const [categoryId, setCategoryId] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => setTags(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleContentChange = useCallback((json: JSONContent) => {
    setContent(json);
  }, []);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Başlık gereklidir.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("Oturum açmanız gerekiyor.");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content,
          documentType,
          categoryId: categoryId || null,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          isPublic,
          authorId: user.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Kaydetme başarısız.");
      }

      const doc = await res.json();
      toast.success("Doküman başarıyla kaydedildi.");
      router.push(`/knowledge-hub/documents/${doc.slug}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Bir hata oluştu.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Editor area */}
      <div className="flex-1 overflow-y-auto p-6" style={{ flex: 2 }}>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="secondary">Taslak</Badge>
          </div>

          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Başlıksız Doküman"
            className="border-0 shadow-none text-3xl font-bold h-auto py-2 px-0 focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />

          <TipTapEditor
            content={content}
            onChange={handleContentChange}
            editable
            placeholder="Yazmaya başlayın..."
          />
        </div>
      </div>

      {/* Metadata panel */}
      <aside className="w-80 shrink-0 border-l bg-muted/30 overflow-y-auto p-6 space-y-6 hidden lg:block">
        <div>
          <h3 className="text-sm font-semibold mb-4">Doküman Ayarları</h3>

          <div className="space-y-4">
            {/* Document type */}
            <div className="space-y-2">
              <Label>Doküman Türü</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>
                      {dt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Etiketler</Label>
              <div className="flex flex-wrap gap-1.5 p-2 border rounded-md min-h-[40px]">
                {tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant={
                      selectedTags.includes(tag.id) ? "default" : "outline"
                    }
                    className="cursor-pointer transition-colors"
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </Badge>
                ))}
                {tags.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Etiket bulunamadı
                  </span>
                )}
              </div>
            </div>

            {/* Public toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="is-public">Herkese Açık</Label>
              <Switch
                id="is-public"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>

            {/* Team access placeholder */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Takım Erişimi</Label>
              <p className="text-xs text-muted-foreground">
                Takım erişim kontrolü yakında eklenecek.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-4 border-t">
          <Button className="w-full gap-2" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Kaydet
          </Button>
          <Button variant="outline" className="w-full gap-2" disabled>
            <Send className="size-4" />
            İncelemeye Gönder
          </Button>
        </div>
      </aside>
    </div>
  );
}

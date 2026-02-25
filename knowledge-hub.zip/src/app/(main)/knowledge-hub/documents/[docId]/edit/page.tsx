"use client";

import { useState, useEffect, useCallback, use } from "react";
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
import { Save, Send, Loader2, ArrowLeft, History } from "lucide-react";

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

interface DocumentData {
  id: string;
  title: string;
  slug: string;
  content: JSONContent;
  status: string;
  documentType: string;
  categoryId: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  tags: { tagId: string; tag: Tag }[];
  author: { id: string; fullName: string };
  _count?: { comments: number; bookmarks: number; viewLogs: number };
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

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslak",
  IN_REVIEW: "İncelemede",
  PUBLISHED: "Yayında",
  ARCHIVED: "Arşivlendi",
  REJECTED: "Reddedildi",
};

export default function EditDocumentPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<JSONContent | undefined>();
  const [documentType, setDocumentType] = useState("GUIDE");
  const [categoryId, setCategoryId] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [versionCount, setVersionCount] = useState(0);

  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/documents/${docId}`).then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/tags").then((r) => r.json()),
      fetch(`/api/documents/${docId}/versions`)
        .then((r) => r.json())
        .catch(() => []),
    ])
      .then(([docData, cats, tagsData, versions]) => {
        if (docData.error) {
          toast.error("Doküman bulunamadı.");
          router.push("/knowledge-hub");
          return;
        }

        setDoc(docData);
        setTitle(docData.title);
        setContent(docData.content as JSONContent);
        setDocumentType(docData.documentType);
        setCategoryId(docData.categoryId ?? "");
        setSelectedTags(
          docData.tags?.map((t: { tagId: string }) => t.tagId) ?? []
        );
        setIsPublic(docData.isPublic);
        setCategories(Array.isArray(cats) ? cats : []);
        setTags(Array.isArray(tagsData) ? tagsData : []);
        setVersionCount(Array.isArray(versions) ? versions.length : 0);
      })
      .catch(() => toast.error("Veri yüklenirken hata oluştu."))
      .finally(() => setLoading(false));
  }, [docId, router]);

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
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content,
          documentType,
          categoryId: categoryId || null,
          tags: selectedTags,
          isPublic,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Güncelleme başarısız.");
      }

      toast.success("Doküman başarıyla güncellendi.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Bir hata oluştu.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="flex h-full">
      {/* Editor area */}
      <div className="flex-1 overflow-y-auto p-6" style={{ flex: 2 }}>
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                router.push(`/knowledge-hub/documents/${doc.slug}`)
              }
            >
              <ArrowLeft className="size-4 mr-1" />
              Geri
            </Button>
            <Badge variant="secondary">
              {STATUS_LABELS[doc.status] ?? doc.status}
            </Badge>
            {versionCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <History className="size-3" />v{versionCount}
              </Badge>
            )}
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
              <Label htmlFor="is-public-edit">Herkese Açık</Label>
              <Switch
                id="is-public-edit"
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

        {/* Version info */}
        <div className="space-y-2 border-t pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Versiyon Bilgisi
          </h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Oluşturulma</span>
              <span>
                {new Date(doc.createdAt).toLocaleDateString("tr-TR")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Son güncelleme</span>
              <span>
                {new Date(doc.updatedAt).toLocaleDateString("tr-TR")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Versiyonlar</span>
              <span>{versionCount}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-4 border-t">
          <Button
            className="w-full gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Güncelle
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

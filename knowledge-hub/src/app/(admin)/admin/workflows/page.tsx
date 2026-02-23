"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  XCircle,
  GitPullRequest,
  Clock,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

interface PendingDocument {
  id: string;
  title: string;
  slug: string;
  documentType: string;
  status: string;
  updatedAt: string;
  author: { fullName: string } | null;
  category: { name: string } | null;
}

export default function WorkflowsPage() {
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        const docs = Array.isArray(data) ? data : data.documents ?? [];
        setDocuments(
          docs.filter(
            (d: { status: string }) => d.status === "IN_REVIEW"
          )
        );
      }
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleApprove = async (docId: string) => {
    setProcessing(docId);
    try {
      const res = await fetch(`/api/documents/${docId}/publish`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Doküman yayınlandı");
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
      } else {
        const data = await res.json();
        toast.error(data.error || "Onaylama başarısız");
      }
    } catch {
      toast.error("Bir hata oluştu");
    } finally {
      setProcessing(null);
    }
  };

  const openRejectDialog = (docId: string) => {
    setSelectedDocId(docId);
    setRejectComment("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedDocId) return;

    setProcessing(selectedDocId);
    try {
      const res = await fetch(`/api/documents/${selectedDocId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "REJECTED",
          changeNote: rejectComment || "Reddedildi",
        }),
      });
      if (res.ok) {
        toast.success("Doküman reddedildi");
        setDocuments((prev) =>
          prev.filter((d) => d.id !== selectedDocId)
        );
        setRejectDialogOpen(false);
      } else {
        toast.error("Reddetme başarısız");
      }
    } catch {
      toast.error("Bir hata oluştu");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <GitPullRequest className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-bold">İş Akışları</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Onay bekleyen dokümanları yönetin.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Onay bekleyen doküman yok</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            Tüm dokümanlar incelendi. Yeni bir doküman incelemeye
            gönderildiğinde burada görünecektir.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Doküman</TableHead>
              <TableHead>Yazar</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Tarih</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{doc.title}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {doc.author?.fullName ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {doc.category?.name ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(doc.updatedAt).toLocaleDateString("tr-TR", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="text-amber-600 border-amber-300"
                  >
                    İncelemede
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={processing === doc.id}
                      onClick={() => handleApprove(doc.id)}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Onayla
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-1"
                      disabled={processing === doc.id}
                      onClick={() => openRejectDialog(doc.id)}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reddet
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dokümanı Reddet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Red Gerekçesi</Label>
              <Input
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Red gerekçesini yazın..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRejectDialogOpen(false)}
              >
                İptal
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={processing !== null}
              >
                Reddet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

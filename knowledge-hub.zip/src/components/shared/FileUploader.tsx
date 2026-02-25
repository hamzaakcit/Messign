"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, X, FileText, Image, Film, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface UploadedFile {
  name: string;
  type: string;
  size: number;
  url?: string;
}

interface FileUploaderProps {
  onUpload: (file: UploadedFile) => void;
  accept?: string;
  maxSize?: number; // MB
  className?: string;
}

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  image: Image,
  video: Film,
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploader({
  onUpload,
  accept,
  maxSize = 50,
  className,
}: FileUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: globalThis.File) => {
      if (file.size > maxSize * 1024 * 1024) {
        alert(`Dosya boyutu ${maxSize}MB'dan küçük olmalıdır`);
        return;
      }

      setUploading(true);
      setProgress(0);

      try {
        // Get presigned URL
        const res = await fetch("/api/upload/presigned-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          }),
        });

        if (!res.ok) throw new Error("Failed to get upload URL");

        const { path } = await res.json();

        // Simulate upload progress
        for (let i = 0; i <= 100; i += 20) {
          await new Promise((r) => setTimeout(r, 100));
          setProgress(i);
        }

        onUpload({
          name: file.name,
          type: file.type,
          size: file.size,
          url: path,
        });
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [maxSize, onUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
        dragOver
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
          : "border-muted-foreground/25 hover:border-muted-foreground/50",
        className
      )}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onSelect}
        className="hidden"
      />

      {uploading ? (
        <div className="space-y-3">
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">Yükleniyor... %{progress}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">
            Dosyayı sürükleyin veya tıklayın
          </p>
          <p className="text-xs text-muted-foreground">
            Maksimum {maxSize}MB
          </p>
        </div>
      )}
    </div>
  );
}

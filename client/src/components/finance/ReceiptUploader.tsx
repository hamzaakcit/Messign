import { useState, useRef, useCallback } from 'react';
import { Upload, Camera, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReceiptUploaderProps {
  onUpload: (file: File) => Promise<void>;
  className?: string;
}

export function ReceiptUploader({ onUpload, className }: ReceiptUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }

    setUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all',
          dragOver
            ? 'border-primary-500 bg-primary-500/10'
            : 'border-app-border-strong hover:border-white/30 hover:bg-app-nav-hover',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleInputChange}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-primary-500 animate-spin" />
            <p className="text-sm text-app-text">Processing receipt...</p>
            <p className="text-xs text-app-muted">Dora is extracting data with AI</p>
          </div>
        ) : preview ? (
          <div className="relative">
            <img src={preview} alt="Receipt" className="max-h-40 mx-auto rounded-lg" />
            <button
              onClick={(e) => { e.stopPropagation(); setPreview(null); }}
              className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-app-text"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-app-surface-tertiary">
                <Upload className="h-6 w-6 text-app-muted" />
              </div>
              <div className="p-3 rounded-full bg-app-surface-tertiary">
                <Camera className="h-6 w-6 text-app-muted" />
              </div>
            </div>
            <div>
              <p className="text-sm text-app-text font-medium">Drop your receipt here</p>
              <p className="text-xs text-app-muted mt-1">or click to browse / take a photo</p>
            </div>
            <p className="text-xs text-app-muted">Supports JPG, PNG, PDF</p>
          </div>
        )}
      </div>
    </div>
  );
}

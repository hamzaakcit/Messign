import { useState, useRef, useCallback } from 'react';
import { Upload, File, X, Loader2 } from 'lucide-react';
import { khUploadAPI } from '@/lib/knowledge-hub/api';
import { cn } from '@/lib/utils';

interface UploadedFile {
  id: string;
  url: string;
  fileName: string;
}

interface Props {
  documentId?: string;
  onFileUploaded?: (file: UploadedFile) => void;
  className?: string;
}

export function FileUploader({ documentId, onFileUploaded, className }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: globalThis.File) => {
    setUploading(true);
    try {
      const result = await khUploadAPI.uploadFile(file, documentId);
      const uploaded = { id: result.id, url: result.url, fileName: result.fileName };
      setUploadedFiles(prev => [...prev, uploaded]);
      onFileUploaded?.(uploaded);
    } catch (e) {
      console.error('Upload failed:', e);
    } finally {
      setUploading(false);
    }
  }, [documentId, onFileUploaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className={className}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
          dragOver ? 'border-primary-500 bg-primary-500/5' : 'border-app-border hover:border-app-border'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpload(file); e.target.value = ''; }}
        />
        {uploading ? (
          <Loader2 className="w-8 h-8 mx-auto mb-2 text-primary-400 animate-spin" />
        ) : (
          <Upload className="w-8 h-8 mx-auto mb-2 text-app-muted" />
        )}
        <p className="text-sm text-app-muted">{uploading ? 'Uploading...' : 'Drop a file here or click to upload'}</p>
        <p className="text-xs text-gray-600 mt-1">Max 50MB</p>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {uploadedFiles.map(file => (
            <div key={file.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-app-card">
              <File className="w-4 h-4 text-app-muted shrink-0" />
              <span className="text-sm text-gray-300 truncate flex-1">{file.fileName}</span>
              <button onClick={() => removeFile(file.id)} className="p-0.5 rounded text-app-muted hover:text-app-text">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

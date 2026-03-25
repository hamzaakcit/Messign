import { useEffect } from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

interface ImagePreviewModalProps {
  url: string;
  name: string;
  onClose: () => void;
}

export function ImagePreviewModal({ url, name, onClose }: ImagePreviewModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
        <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
          <a
            href={url}
            download={name}
            className="p-2 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </a>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <img
          src={url}
          alt={name}
          className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
        />
        <p className="mt-2 text-sm text-white/80 bg-black/40 px-3 py-1 rounded-lg">{name}</p>
      </div>
    </div>
  );
}

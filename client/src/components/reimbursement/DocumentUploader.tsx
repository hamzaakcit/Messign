import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader2, Camera, Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OCROutput {
  vendor_name?: string;
  amount?: number;
  currency?: string;
  date?: string;
}

interface DocumentUploaderProps {
  onUpload: (file: File, documentType?: string) => Promise<unknown>;
  onOCR?: (docId: string) => Promise<unknown>;
  reimbursementId?: string;
  documents: { id: string; file_name: string; document_type: string; ocr_processed?: boolean; ocr_vendor_name?: string; ocr_amount?: number; ocr_currency?: string; ocr_date?: string }[];
  onDocumentAdded?: (doc: unknown) => void;
  onDocumentRemoved?: (docId: string) => void;
  deleteDocument: (docId: string) => Promise<void>;
  triggerOCR: (docId: string) => Promise<unknown>;
  disabled?: boolean;
  /** receipt = Receipt Upload + OCR; invoice = Signed Invoice Upload, no OCR */
  type?: 'receipt' | 'invoice';
  /** When user has no reimbursement id yet: create draft then upload. Receives file (or blob from camera). */
  onCreateDraftAndUpload?: (file: File | Blob, filename: string, documentType: string) => Promise<void>;
  /** Called when user clicks "Apply to Form" with OCR result. */
  onOCRApply?: (data: OCROutput) => void;
}

export function DocumentUploader({
  onUpload,
  documents,
  onDocumentAdded,
  deleteDocument,
  triggerOCR,
  disabled,
  type = 'receipt',
  reimbursementId,
  onCreateDraftAndUpload,
  onOCRApply,
}: DocumentUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const documentType = type === 'invoice' ? 'signed_invoice' : 'receipt';
  const label = type === 'invoice' ? 'Signed Invoice Upload' : 'Receipt Upload';
  const showOCR = type === 'receipt';

  const performUpload = useCallback(
    async (file: File | Blob, filename: string) => {
      try {
        const f = file instanceof File ? file : new File([file], filename || 'capture.jpg', { type: 'image/jpeg' });
        if (reimbursementId) {
          const doc = await onUpload(f, documentType);
          onDocumentAdded?.(doc);
        } else if (onCreateDraftAndUpload) {
          await onCreateDraftAndUpload(f, filename || 'capture.jpg', documentType);
        } else {
          throw new Error('No upload handler available — please save the form first');
        }
      } catch (err) {
        // Re-throw so the caller (handleFileSelect, handleDrop, capturePhoto) can display it
        throw err;
      }
    },
    [reimbursementId, onUpload, documentType, onDocumentAdded, onCreateDraftAndUpload]
  );

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setUploadError(null);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await performUpload(file, file.name);
    } catch (err: any) {
      console.error('[DocumentUploader] Drop upload error:', err);
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || disabled || uploading) return;
    const inputEl = e.target; // Capture ref before async
    setUploadError(null);
    setUploading(true);
    try {
      await performUpload(file, file.name);
    } catch (err: any) {
      console.error('[DocumentUploader] Upload error:', err);
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
    // Reset file input safely (element may be unmounted after navigation)
    try { inputEl.value = ''; } catch { /* ignore if element was removed */ }
  };

  const startCamera = useCallback(() => {
    setCameraError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraOpen(true);
      })
      .catch((err) => {
        setCameraError(err.message || 'Camera access denied');
      });
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraError(null);
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopCamera();
        setUploadError(null);
        setUploading(true);
        performUpload(blob, `capture-${Date.now()}.jpg`)
          .catch((err: any) => setUploadError(err?.message || 'Upload failed'))
          .finally(() => setUploading(false));
      },
      'image/jpeg',
      0.9
    );
  }, [stopCamera, performUpload]);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-colors border-gray-700/50',
          dragging ? 'border-primary-500 bg-primary-500/10' : 'bg-app-surface-tertiary',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={handleFileSelect}
        />
        {uploadError && (
          <p className="text-sm text-red-400 mb-2" role="alert">
            {uploadError}
          </p>
        )}
        <Upload className="w-10 h-10 mx-auto text-app-muted mb-2" />
        <p className="text-sm text-app-muted mb-1">{label}</p>
        <p className="text-xs text-app-muted mb-3">PDF, JPG, PNG up to 10MB</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-app-text text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Choose File'}
          </button>
          {/* Camera: mobile only */}
          <button
            type="button"
            onClick={startCamera}
            disabled={disabled || uploading}
            className="md:hidden px-4 py-2 rounded-lg bg-gray-700 text-app-text text-sm font-medium hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2"
          >
            <Camera className="w-4 h-4" />
            Camera
          </button>
        </div>
        {type === 'invoice' && (
          <p className="mt-3 text-xs text-amber-500/90">Signature Status: Pending Verification</p>
        )}
      </div>

      {documents.length > 0 && (
        <ul className="space-y-2">
          {documents.map((doc: any) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-app-surface-tertiary border border-gray-700/50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-5 h-5 text-app-muted flex-shrink-0" />
                <span className="text-sm text-app-text truncate">{doc.file_name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {doc.ocr_processed && showOCR && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-app-muted">
                      {doc.ocr_vendor_name} | {doc.ocr_amount} {doc.ocr_currency} | {doc.ocr_date}
                    </span>
                    {onOCRApply && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onOCRApply({
                              vendor_name: doc.ocr_vendor_name,
                              amount: doc.ocr_amount,
                              currency: doc.ocr_currency,
                              date: doc.ocr_date,
                            })
                          }
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Apply to Form
                        </button>
                        <button
                          type="button"
                          onClick={() => {}}
                          className="text-xs text-app-muted hover:text-app-muted flex items-center gap-1"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit Manually
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!doc.ocr_processed && showOCR && (
                  <button
                    type="button"
                    onClick={() => {
                      setOcrLoading(doc.id);
                      triggerOCR(doc.id).finally(() => setOcrLoading(null));
                    }}
                    disabled={ocrLoading === doc.id}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    {ocrLoading === doc.id ? 'Processing...' : 'Run OCR'}
                  </button>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => deleteDocument(doc.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Camera modal (mobile) */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 md:hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 w-full object-cover"
          />
          {cameraError && (
            <p className="absolute top-4 left-4 right-4 text-center text-red-400 text-sm">{cameraError}</p>
          )}
          <div className="p-4 flex gap-3 justify-center border-t border-gray-700/50">
            <button
              type="button"
              onClick={stopCamera}
              className="px-4 py-2 rounded-lg bg-gray-700 text-app-text text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              className="px-6 py-2 rounded-lg bg-blue-600 text-app-text text-sm font-medium"
            >
              Capture
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

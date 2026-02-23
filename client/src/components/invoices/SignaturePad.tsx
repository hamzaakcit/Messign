import { useState, useRef, useEffect, useCallback } from 'react';
import { X, PenTool, Save, Camera, Upload, RefreshCw } from 'lucide-react';
import { signaturesAPI } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface SignaturePadProps {
  open: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
}

type TabMode = 'camera' | 'upload';

/**
 * Extract signature ink from an image.
 *
 * Uses adaptive local thresholding: each pixel is compared to its local
 * neighborhood average. Only pixels significantly darker than their
 * surroundings are kept as ink. This ignores shadows, hands, uneven lighting,
 * and anything that isn't a dark stroke on a lighter background.
 */
function extractSignature(
  sourceCanvas: HTMLCanvasElement,
  outputWidth = 600,
  outputHeight = 200,
): string {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return sourceCanvas.toDataURL('image/png');

  const srcData = srcCtx.getImageData(0, 0, sw, sh);
  const pixels = srcData.data;

  // Step 1: Build grayscale array
  const gray = new Float32Array(sw * sh);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
  }

  // Step 2: Compute integral image for fast local average
  const integral = new Float64Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    let rowSum = 0;
    for (let x = 0; x < sw; x++) {
      rowSum += gray[y * sw + x];
      integral[y * sw + x] = rowSum + (y > 0 ? integral[(y - 1) * sw + x] : 0);
    }
  }

  function localAvg(x: number, y: number, r: number): number {
    const x1 = Math.max(0, x - r) - 1;
    const y1 = Math.max(0, y - r) - 1;
    const x2 = Math.min(sw - 1, x + r);
    const y2 = Math.min(sh - 1, y + r);
    const a = y1 >= 0 && x1 >= 0 ? integral[y1 * sw + x1] : 0;
    const b = y1 >= 0 ? integral[y1 * sw + x2] : 0;
    const c = x1 >= 0 ? integral[y2 * sw + x1] : 0;
    const d = integral[y2 * sw + x2];
    const area = (x2 - (x1 >= 0 ? x1 : -1)) * (y2 - (y1 >= 0 ? y1 : -1));
    return (d - b - c + a) / area;
  }

  // Step 3: Adaptive threshold — pixel must be darker than local avg by a margin
  const radius = Math.max(15, Math.round(Math.min(sw, sh) / 20)); // adaptive window
  const sensitivity = 30; // how much darker than local avg to count as ink
  const inkMask = new Uint8Array(sw * sh); // 1 = ink

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = y * sw + x;
      const avg = localAvg(x, y, radius);
      // Pixel must be significantly darker than local neighborhood
      // AND reasonably dark in absolute terms (below 180 out of 255)
      if (gray[idx] < avg - sensitivity && gray[idx] < 180) {
        inkMask[idx] = 1;
      }
    }
  }

  // Step 4: Remove small noise blobs via connected-component labeling
  const labels = new Int32Array(sw * sh);
  const componentSizes: Map<number, number> = new Map();
  let nextLabel = 1;

  function floodFill(startX: number, startY: number, label: number): number {
    const stack: [number, number][] = [[startX, startY]];
    let count = 0;
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      const ci = cy * sw + cx;
      if (cx < 0 || cx >= sw || cy < 0 || cy >= sh) continue;
      if (labels[ci] !== 0 || inkMask[ci] !== 1) continue;
      labels[ci] = label;
      count++;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return count;
  }

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = y * sw + x;
      if (inkMask[idx] === 1 && labels[idx] === 0) {
        const size = floodFill(x, y, nextLabel);
        componentSizes.set(nextLabel, size);
        nextLabel++;
      }
    }
  }

  // Remove components smaller than minSize (noise dots)
  const minSize = Math.max(12, Math.round(sw * sh / 30000));
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] > 0 && (componentSizes.get(labels[i]) ?? 0) < minSize) {
      inkMask[i] = 0;
    }
  }

  // Step 5: Build output image — ink pixels black, everything else transparent
  let minX = sw, minY = sh, maxX = 0, maxY = 0;
  const outData = srcCtx.createImageData(sw, sh);
  const out = outData.data;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = y * sw + x;
      const p = idx * 4;
      if (inkMask[idx] === 1) {
        out[p] = 0;     // R
        out[p + 1] = 0; // G
        out[p + 2] = 0; // B
        // Opacity: strongly opaque for clear ink, softer at edges
        const avg = localAvg(x, y, radius);
        const ratio = 1 - gray[idx] / avg;
        out[p + 3] = Math.min(255, Math.round(ratio * ratio * 600 + 80));
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      } else {
        out[p + 3] = 0; // transparent
      }
    }
  }

  srcCtx.putImageData(outData, 0, 0);

  // Step 6: Crop to bounding box, scale to output dimensions
  const pad = 10;
  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(sw, maxX + pad + 1) - cropX;
  const cropH = Math.min(sh, maxY + pad + 1) - cropY;

  if (cropW <= 0 || cropH <= 0) return sourceCanvas.toDataURL('image/png');

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outputWidth;
  outCanvas.height = outputHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return sourceCanvas.toDataURL('image/png');

  const scale = Math.min(outputWidth / cropW, outputHeight / cropH);
  const dw = cropW * scale;
  const dh = cropH * scale;
  const dx = (outputWidth - dw) / 2;
  const dy = (outputHeight - dh) / 2;

  outCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, dx, dy, dw, dh);
  return outCanvas.toDataURL('image/png');
}

export function SignaturePad({ open, onClose, targetUserId, targetUserName }: SignaturePadProps) {
  const { user } = useAuthStore();
  const [existingSignature, setExistingSignature] = useState<string | null>(null);
  const [capturedSignature, setCapturedSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tab, setTab] = useState<TabMode>('upload');

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing signature
  useEffect(() => {
    if (!open || !user?.id || !targetUserId) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    setCapturedSignature(null);
    setCameraError(null);
    signaturesAPI.get(user.id, targetUserId)
      .then((data) => {
        if (data?.signature_data) {
          setExistingSignature(data.signature_data);
        } else {
          setExistingSignature(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, user?.id, targetUserId]);

  // Cleanup camera on close or tab switch
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (!open) stopCamera();
  }, [open, stopCamera]);

  useEffect(() => {
    if (tab !== 'camera') stopCamera();
  }, [tab, stopCamera]);

  // Attach stream to video element whenever both exist
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && cameraActive) {
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play().catch(() => {});
      };
    }
  }, [cameraActive]);

  // Start camera — just acquire the stream, then flip cameraActive so the video element renders
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraActive(true); // triggers re-render, then useEffect above wires the stream
    } catch (err: any) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Could not access camera. Make sure a camera is connected.'
      );
    }
  };

  // Capture from camera — crops to the guide rectangle area only
  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setTimeout(captureFromCamera, 300);
      return;
    }
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    // Guide box: center 80% width, center ~33% height (matches the overlay)
    const guideW = Math.round(vw * 0.8);
    const guideH = Math.round(vh * 0.33);
    const guideX = Math.round((vw - guideW) / 2);
    const guideY = Math.round((vh - guideH) / 2);

    // Draw full frame (no flip — CSS mirror is visual only, raw feed is correct)
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = vw;
    fullCanvas.height = vh;
    const fullCtx = fullCanvas.getContext('2d');
    if (!fullCtx) return;
    fullCtx.drawImage(video, 0, 0, vw, vh);

    // Crop to guide box
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = guideW;
    cropCanvas.height = guideH;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return;
    cropCtx.drawImage(fullCanvas, guideX, guideY, guideW, guideH, 0, 0, guideW, guideH);

    const processed = extractSignature(cropCanvas);
    setCapturedSignature(processed);
    stopCamera();
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, etc.)');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const processed = extractSignature(canvas);
        setCapturedSignature(processed);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    // Reset file input so the same file can be re-selected
    e.target.value = '';
  };

  // Save
  const handleSave = async () => {
    if (!user?.id || !capturedSignature) return;
    setSaving(true);
    setError(null);
    try {
      await signaturesAPI.save(user.id, targetUserId, capturedSignature);
      setSuccess(true);
      setExistingSignature(capturedSignature);
      setTimeout(() => onClose(), 800);
    } catch (e: any) {
      setError(e.message || 'Failed to save signature');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setCapturedSignature(null);
    setError(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rounded-xl border border-app-border bg-dark-800 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-purple-400" />
            <h3 className="font-bold text-app">Digital Signature</h3>
          </div>
          <button onClick={() => { stopCamera(); onClose(); }} className="p-1 text-app-muted hover:text-app">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-app-muted">
            Signature for <span className="font-semibold text-app">{targetUserName}</span>
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
              Saved successfully!
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-app-muted">Loading...</div>
          ) : capturedSignature ? (
            /* ──── Captured / processed result ──── */
            <div className="space-y-3">
              <p className="text-xs text-app-muted font-semibold uppercase tracking-wider">Extracted Signature</p>
              <div className="border border-app-border rounded-lg p-4 bg-white flex items-center justify-center min-h-[120px]">
                <img src={capturedSignature} alt="Extracted signature" className="max-h-24 max-w-full" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1 text-sm text-app-muted hover:text-app transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Existing signature preview */}
              {existingSignature && (
                <div className="border border-app-border rounded-lg p-4 bg-white">
                  <p className="text-xs text-gray-400 mb-2">Current Signature:</p>
                  <img src={existingSignature} alt="Current signature" className="max-h-16 mx-auto" />
                </div>
              )}

              {/* Tabs */}
              <div className="flex rounded-lg border border-app-border overflow-hidden">
                <button
                  onClick={() => setTab('upload')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    tab === 'upload'
                      ? 'bg-purple-600 text-white'
                      : 'bg-dark-700 text-app-muted hover:text-app hover:bg-dark-600'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  Upload Image
                </button>
                <button
                  onClick={() => setTab('camera')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    tab === 'camera'
                      ? 'bg-purple-600 text-white'
                      : 'bg-dark-700 text-app-muted hover:text-app hover:bg-dark-600'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  Scan with Camera
                </button>
              </div>

              {/* Upload tab */}
              {tab === 'upload' && (
                <div className="space-y-3">
                  <p className="text-xs text-app-muted">
                    Upload a photo or scan of your signature on white paper. The background will be automatically removed.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-8 rounded-lg border-2 border-dashed border-app-border bg-dark-700 hover:bg-dark-600 hover:border-purple-500/50 transition-colors flex flex-col items-center gap-2 text-app-muted hover:text-app"
                  >
                    <Upload className="w-8 h-8 opacity-60" />
                    <span className="text-sm font-medium">Click to select image</span>
                    <span className="text-xs opacity-60">PNG, JPG, HEIC — any photo of your signature</span>
                  </button>
                </div>
              )}

              {/* Camera tab */}
              {tab === 'camera' && (
                <div className="space-y-3">
                  <p className="text-xs text-app-muted">
                    Hold your signature on white paper in front of the camera. Make sure the signature is well-lit and clearly visible.
                  </p>
                  {cameraError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{cameraError}</div>
                  )}
                  {!cameraActive ? (
                    <button
                      onClick={startCamera}
                      className="w-full py-8 rounded-lg border-2 border-dashed border-app-border bg-dark-700 hover:bg-dark-600 hover:border-purple-500/50 transition-colors flex flex-col items-center gap-2 text-app-muted hover:text-app"
                    >
                      <Camera className="w-8 h-8 opacity-60" />
                      <span className="text-sm font-medium">Start Camera</span>
                      <span className="text-xs opacity-60">Your browser will ask for camera permission</span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative rounded-lg overflow-hidden border border-app-border bg-black">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-48 object-cover -scale-x-100"
                        />
                        {/* Guide overlay */}
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                          <div className="w-4/5 h-16 border-2 border-white/40 rounded-lg" />
                        </div>
                      </div>
                      <button
                        onClick={captureFromCamera}
                        className="w-full py-2.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors flex items-center justify-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        Capture
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-app-border flex justify-end gap-2">
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-app-muted hover:bg-app-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || !capturedSignature}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Signature'}
          </button>
        </div>
      </div>
    </div>
  );
}

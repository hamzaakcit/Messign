import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download, X, Maximize2, Minimize2 } from 'lucide-react';
import type { Presentation } from '@/lib/knowledge-hub/api';
import { khPresentationAPI } from '@/lib/knowledge-hub/api';
import { cn } from '@/lib/utils';

interface Props {
  presentation: Presentation;
  onClose: () => void;
}

export function PresentationViewer({ presentation, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = 1 + presentation.slides.length;
  const currentSlide = currentIndex === 0 ? null : presentation.slides[currentIndex - 1];

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, totalSlides - 1));
  }, [totalSlides]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false);
        else onClose();
        return;
      }
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen, onClose, goPrev, goNext]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await khPresentationAPI.exportPptx(presentation);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `presentation-${Date.now()}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (fullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else if (!fullscreen && document.fullscreenElement) {
      document.exitFullscreen?.();
    }
  }, [fullscreen]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-app-bg rounded-xl border border-app-border overflow-hidden',
        fullscreen && 'fixed inset-0 z-50 rounded-none'
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-app-border bg-app-sidebar">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-app-text truncate max-w-[200px]">{presentation.title}</span>
          <span className="text-xs text-app-muted">
            {currentIndex + 1} / {totalSlides}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="p-2 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-primary-400 hover:bg-app-hover disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Exporting…' : 'Download PPTX'}
          </button>
        </div>
      </div>

      {/* Slide content */}
      <div className="flex-1 flex items-center justify-center p-8 min-h-[400px]">
        <div className="w-full max-w-3xl">
          {currentIndex === 0 ? (
            <div className="text-center py-12">
              <h1 className="text-4xl font-bold text-app-text mb-4">{presentation.title}</h1>
              <p className="text-app-muted text-sm">Knowledge Hub Presentation</p>
            </div>
          ) : currentSlide ? (
            <div>
              <h2 className="text-2xl font-bold text-app-text mb-6">{currentSlide.title}</h2>
              <ul className="space-y-3">
                {currentSlide.bullets.map((bullet, i) => (
                  <li key={i} className="flex gap-3 text-app-muted">
                    <span className="text-primary-400 shrink-0">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {/* Prev / Next */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-app-border bg-app-sidebar">
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-app-muted hover:text-app-text hover:bg-app-hover disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <div className="flex gap-1">
          <button
            onClick={() => setCurrentIndex(0)}
            className={cn(
              'w-2 h-2 rounded-full transition-colors',
              0 === currentIndex ? 'bg-primary-500' : 'bg-app-hover hover:bg-app-hover'
            )}
            title="Title"
          />
          {presentation.slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i + 1)}
              className={cn(
                'w-2 h-2 rounded-full transition-colors',
                i + 1 === currentIndex ? 'bg-primary-500' : 'bg-app-hover hover:bg-app-hover'
              )}
              title={`Slide ${i + 2}`}
            />
          ))}
        </div>
        <button
          onClick={goNext}
          disabled={currentIndex === totalSlides - 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-app-muted hover:text-app-text hover:bg-app-hover disabled:opacity-40 disabled:pointer-events-none"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

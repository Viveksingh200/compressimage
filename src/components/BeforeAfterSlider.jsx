import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { formatBytes } from '../utils/fileHandler';

export default function BeforeAfterSlider({ originalUrl, compressedUrl, originalSize, compressedSize, fileName, onClose }) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMove = (clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    setSliderPosition(percentage);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  useEffect(() => {
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, []);

  const savedPercent = originalSize > 0 
    ? Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white border border-surface-200 rounded-xl shadow-modal max-w-4xl w-full flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 bg-surface-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900 text-sm">{fileName}</h3>
              <p className="text-xs text-surface-500">Drag slider left/right to compare original vs compressed visual quality</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-surface-500 hover:text-surface-900 hover:bg-surface-200 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Comparison Canvas Area */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center bg-surface-100 min-h-[360px] select-none">
          <div 
            ref={containerRef}
            className="relative overflow-hidden rounded-lg border border-surface-200 bg-white max-h-[500px] w-full flex items-center justify-center cursor-ew-resize"
            onMouseDown={(e) => { setIsDragging(true); handleMove(e.clientX); }}
            onTouchStart={(e) => { setIsDragging(true); handleMove(e.touches[0].clientX); }}
            onMouseMove={handleMouseMove}
            onTouchMove={handleTouchMove}
          >
            {/* Original Image (Underneath) */}
            <img 
              src={originalUrl} 
              alt="Original"
              className="max-h-[500px] w-full object-contain block"
            />
            
            {/* Compressed Image (Clipped Overlay on Top) */}
            <div 
              className="absolute top-0 bottom-0 right-0 overflow-hidden"
              style={{ left: `${sliderPosition}%` }}
            >
              <img 
                src={compressedUrl || originalUrl} 
                alt="Compressed"
                className="max-h-[500px] w-full object-contain block absolute top-0 right-0 max-w-none"
                style={{ 
                  width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100%',
                  height: containerRef.current ? `${containerRef.current.clientHeight}px` : '100%'
                }}
              />
            </div>

            {/* Slider Divider Line */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-brand-600 shadow-md cursor-ew-resize pointer-events-none"
              style={{ left: `${sliderPosition}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg border-2 border-white">
                <ArrowLeftRight className="w-4 h-4" />
              </div>
            </div>

            {/* Labels */}
            <div className="absolute bottom-3 left-3 bg-surface-900/80 text-white text-xs font-medium px-2.5 py-1 rounded-md backdrop-blur-xs">
              Original: {formatBytes(originalSize)}
            </div>
            <div className="absolute bottom-3 right-3 bg-brand-600 text-white text-xs font-medium px-2.5 py-1 rounded-md shadow-sm">
              Compressed: {formatBytes(compressedSize)} ({savedPercent}% saved)
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-surface-200 bg-surface-50 flex items-center justify-between text-xs text-surface-500">
          <span>Move cursor to inspect resolution details</span>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-surface-900 text-white rounded-lg font-medium text-xs hover:bg-surface-800 transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}

import React from 'react';
import { Eye, X, Download } from 'lucide-react';
import { formatBytes } from '../utils/fileHandler';

export default function BeforeAfterSlider({ originalUrl, compressedUrl, originalSize, compressedSize, fileName, onClose }) {
  const savedPercent = originalSize > 0 
    ? Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100))
    : 0;

  const handleDownload = () => {
    if (!compressedUrl) return;
    const link = document.createElement('a');
    link.href = compressedUrl;
    link.download = `compressed_${fileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/70 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white border border-surface-200 rounded-2xl shadow-modal max-w-4xl w-full flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 bg-surface-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900 text-sm">{fileName}</h3>
              <p className="text-xs text-surface-500">Compressed Image Quality Preview</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-surface-500 hover:text-surface-900 hover:bg-surface-200 rounded-lg transition-colors"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clean Compressed Image Preview Area */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center bg-surface-100 min-h-[360px]">
            <img 
              src={compressedUrl || originalUrl} 
              alt={fileName}
              className="max-h-[480px] w-full object-contain block rounded-lg"
            />
        </div>

      </div>
    </div>
  );
}

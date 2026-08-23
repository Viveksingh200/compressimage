import React from 'react';
import { Eye, X } from 'lucide-react';

export default function BeforeAfterSlider({ originalUrl, compressedUrl, fileName, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/70 dark:bg-black/80 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-[#131b2e] border border-surface-200 dark:border-surface-800 rounded-2xl shadow-modal max-w-4xl w-full flex flex-col overflow-hidden transition-colors">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-[#0e1626]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 rounded-lg">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900 dark:text-white text-sm">{fileName}</h3>
              <p className="text-xs text-surface-500 dark:text-surface-400">Compressed Image Quality Preview</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white hover:bg-surface-200 dark:hover:bg-surface-800 rounded-lg transition-colors"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Clean Compressed Image Preview Area */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center bg-surface-100 dark:bg-[#0b0f19] min-h-[360px]">
          <img 
            src={compressedUrl || originalUrl} 
            alt={fileName}
            className="max-h-[480px] w-full object-contain block rounded-lg shadow-sm"
          />
        </div>

      </div>
    </div>
  );
}

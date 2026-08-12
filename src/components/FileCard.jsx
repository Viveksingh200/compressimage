import React, { useState } from 'react';
import { Download, Eye, Trash2, CheckCircle2, Loader2, FileArchive, Image as ImageIcon } from 'lucide-react';
import { formatBytes } from '../utils/fileHandler';
import BeforeAfterSlider from './BeforeAfterSlider';

export default function FileCard({ item, onRemove }) {
  const [showComparison, setShowComparison] = useState(false);

  const handleSingleDownload = () => {
    if (!item.compressedBlob) return;
    
    let extension = item.outputFormat ? item.outputFormat.toLowerCase() : 'jpg';
    if (extension === 'jpeg') extension = 'jpg';
    
    let fileName = item.name;
    const parts = fileName.split('.');
    if (parts.length > 1) {
      parts.pop();
      fileName = `${parts.join('.')}.${extension}`;
    } else {
      fileName = `${fileName}.${extension}`;
    }

    const url = URL.createObjectURL(item.compressedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `compressed_${fileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="bg-white border border-surface-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-surface-300 shadow-subtle animate-fade-in">
        
        {/* Left: Thumbnail & Info */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative w-14 h-14 rounded-lg border border-surface-200 bg-surface-50 overflow-hidden flex-shrink-0 flex items-center justify-center">
            {item.previewUrl ? (
              <img 
                src={item.compressedUrl || item.previewUrl} 
                alt={item.name} 
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="w-6 h-6 text-surface-400" />
            )}
            {item.isFromZip && (
              <span className="absolute top-1 left-1 bg-surface-900 text-white p-0.5 rounded text-[10px]" title={`From ZIP: ${item.zipName}`}>
                <FileArchive className="w-3 h-3" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm text-surface-900 truncate" title={item.name}>
                {item.name}
              </h4>
              {item.outputFormat && (
                <span className="bg-surface-100 text-surface-600 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border border-surface-200">
                  {item.outputFormat}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1 text-xs text-surface-500">
              <span>Original: <strong className="text-surface-700 font-medium">{formatBytes(item.originalSize)}</strong></span>
              {item.width && item.height && (
                <>
                  <span>•</span>
                  <span>{item.width}×{item.height}px</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Middle: Compression Result Status */}
        <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 border-t sm:border-t-0 pt-3 sm:pt-0 border-surface-100">
          
          {item.status === 'processing' && (
            <div className="flex items-center gap-2 text-xs font-medium text-brand-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Compressing...</span>
            </div>
          )}

          {item.status === 'success' && (
            <div className="flex flex-col items-start sm:items-end">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-surface-900">
                  {formatBytes(item.compressedSize)}
                </span>
                <span className="bg-success-50 text-success-600 border border-success/20 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {item.savedPercent}% saved
                </span>
              </div>
              <span className="text-[11px] text-surface-500 mt-0.5">
                Saved {formatBytes(item.savedBytes)} (Quality: {item.qualityUsed}%)
              </span>
            </div>
          )}

          {item.status === 'pending' && (
            <div className="flex flex-col items-start sm:items-end">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-md border border-brand-100">
                <span>Target: ~{item.estimatedOutputText || '100 KB'}</span>
              </div>
              <span className="text-[11px] text-surface-500 mt-0.5">
                Est. saved: ~{item.estimatedSavedText || '90%'}
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            {item.status === 'success' && (
              <>
                <button
                  onClick={() => setShowComparison(true)}
                  className="p-2 text-surface-600 hover:text-surface-900 hover:bg-surface-100 rounded-lg transition-colors border border-surface-200 shadow-subtle"
                  title="Compare Before / After"
                  aria-label="Compare original and compressed image"
                >
                  <Eye className="w-4 h-4" />
                </button>

                <button
                  onClick={handleSingleDownload}
                  className="flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white rounded-lg font-medium text-xs hover:bg-brand-700 transition-colors shadow-subtle"
                  title="Download Compressed Image"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </>
            )}

            <button
              onClick={() => onRemove(item.id)}
              className="p-2 text-surface-400 hover:text-danger hover:bg-danger-50 rounded-lg transition-colors"
              title="Remove File"
              aria-label="Remove image"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

      {showComparison && (
        <BeforeAfterSlider
          originalUrl={item.previewUrl}
          compressedUrl={item.compressedUrl}
          originalSize={item.originalSize}
          compressedSize={item.compressedSize}
          fileName={item.name}
          onClose={() => setShowComparison(false)}
        />
      )}
    </>
  );
}

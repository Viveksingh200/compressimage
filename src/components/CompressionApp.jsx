import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileArchive, 
  Download, 
  Trash2, 
  Settings2, 
  Zap, 
  CheckCircle2, 
  ShieldCheck, 
  RefreshCw,
  FolderArchive,
  Loader2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { processInputFiles, formatBytes } from '../utils/fileHandler';
import { compressSingleImage } from '../utils/compressorEngine';
import { downloadAllAsZip } from '../utils/zipGenerator';
import FileCard from './FileCard';

export default function CompressionApp({ initialPreset = '100kb', initialFormat = 'original' }) {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Settings State
  const [mode, setMode] = useState('quality'); // 'quality' by default | 'targetSize'
  const [presetKb, setPresetKb] = useState(() => {
    if (initialPreset === '50kb') return 50;
    if (initialPreset === '100kb') return 100;
    if (initialPreset === '200kb') return 200;
    if (initialPreset === '500kb') return 500;
    if (initialPreset === '1mb') return 1024;
    if (initialPreset === '2mb') return 2048;
    return 100;
  });
  const [customKb, setCustomKb] = useState(100);
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState(() => {
    if (initialFormat === 'jpg') return 'image/jpeg';
    if (initialFormat === 'png') return 'image/png';
    if (initialFormat === 'webp') return 'image/webp';
    if (initialFormat === 'avif') return 'image/avif';
    return 'original';
  });
  const [scalePercent, setScalePercent] = useState(100);

  const fileInputRef = useRef(null);

  // Handle Drag Events
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setIsUploading(true);
      try {
        const processed = await processInputFiles(e.dataTransfer.files);
        setFiles((prev) => [...prev, ...processed]);
      } catch (err) {
        console.error("Error reading dropped files:", err);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleFileSelect = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true);
      try {
        const processed = await processInputFiles(e.target.files);
        setFiles((prev) => [...prev, ...processed]);
      } catch (err) {
        console.error("Error reading selected files:", err);
      } finally {
        setIsUploading(false);
      }
    }
  };

  // Run Batch Compression
  const runCompression = async () => {
    if (files.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);

    const updatedFiles = [...files];
    const targetKbToUse = mode === 'targetSize' ? presetKb : null;

    for (let i = 0; i < updatedFiles.length; i++) {
      const current = updatedFiles[i];
      updatedFiles[i] = { ...current, status: 'processing' };
      setFiles([...updatedFiles]);

      try {
        const compressedResult = await compressSingleImage(current, {
          targetSizeKB: targetKbToUse,
          quality: quality / 100,
          format,
          scalePercent,
        });

        updatedFiles[i] = compressedResult;
      } catch (err) {
        console.error("Compression error for file:", current.name, err);
        updatedFiles[i] = { ...current, status: 'error' };
      }

      const percent = Math.round(((i + 1) / updatedFiles.length) * 100);
      setProgress(percent);
      setFiles([...updatedFiles]);
    }

    setIsProcessing(false);

    // Trigger celebratory confetti if any file was compressed successfully
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 }
      });
    } catch (e) {}
  };

  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    setFiles([]);
    setProgress(0);
  };

  // Overall Stats & Estimation Calculation
  const totalOriginalSize = files.reduce((acc, f) => acc + (f.originalSize || 0), 0);
  const totalCompressedSize = files.reduce((acc, f) => acc + (f.compressedSize || f.originalSize || 0), 0);
  const totalSavedBytes = Math.max(0, totalOriginalSize - totalCompressedSize);
  const totalSavedPercent = totalOriginalSize > 0 
    ? Math.round((totalSavedBytes / totalOriginalSize) * 100) 
    : 0;

  // Compute Estimated Target Output Size (KB/MB) for loaded files
  const calculateEstimate = (fileOriginalSize) => {
    let estBytes = 0;
    if (mode === 'targetSize') {
      const targetBytes = presetKb * 1024;
      estBytes = Math.min(fileOriginalSize, targetBytes);
    } else {
      // Quality mode approximation
      const ratio = (quality / 100) * 0.65 * (scalePercent / 100);
      estBytes = Math.min(fileOriginalSize, Math.max(1024, fileOriginalSize * ratio));
    }
    const estSaved = Math.max(0, fileOriginalSize - estBytes);
    const estPercent = fileOriginalSize > 0 ? Math.round((estSaved / fileOriginalSize) * 100) : 0;
    return {
      estBytes,
      estText: formatBytes(estBytes),
      estSavedText: `${formatBytes(estSaved)} (${estPercent}% saved)`
    };
  };

  const hasSuccessFiles = files.some(f => f.status === 'success');

  // Compute live estimated bytes dynamically from current slider positions
  const totalEstimatedOutputBytes = files.reduce((acc, f) => {
    return acc + calculateEstimate(f.originalSize).estBytes;
  }, 0);

  const totalEstimatedSavedBytes = Math.max(0, totalOriginalSize - totalEstimatedOutputBytes);
  const totalEstimatedSavedPercent = totalOriginalSize > 0 
    ? Math.round((totalEstimatedSavedBytes / totalOriginalSize) * 100) 
    : 0;

  // Helper to update settings and enable live estimation & re-compression
  const handleSettingChange = (changeFn) => {
    changeFn();
    if (hasSuccessFiles) {
      setFiles(prev => prev.map(f => ({ ...f, status: 'pending' })));
    }
  };

  const successCount = files.filter((f) => f.status === 'success').length;

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
      
      {/* Upload Zone */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 bg-white ${
          isDragging 
            ? 'border-brand-600 bg-brand-50/50 shadow-md scale-[1.005]' 
            : 'border-surface-200 hover:border-brand-500/50 hover:bg-surface-50/50 shadow-subtle'
        }`}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          multiple 
          accept="image/*,.zip" 
          onChange={handleFileSelect} 
          className="hidden" 
          id="file-upload-input"
        />

        <div className="flex flex-col items-center justify-center gap-4 max-w-lg mx-auto pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 border border-brand-100 flex items-center justify-center shadow-subtle">
            <Upload className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight">
              Drop your images or ZIP file here
            </h3>
            <p className="text-sm sm:text-base text-surface-500 mt-1.5 font-medium">
              Supports JPG, PNG, WebP, AVIF & ZIP archives. 100% private in browser.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <span className="px-5 py-2.5 bg-brand-600 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-subtle hover:bg-brand-700 transition-colors flex items-center gap-2 pointer-events-auto">
              <Upload className="w-4 h-4" />
              Browse Files
            </span>
            <span className="px-5 py-2.5 bg-surface-100 text-surface-700 font-semibold text-xs sm:text-sm rounded-xl border border-surface-200 hover:bg-surface-200 transition-colors flex items-center gap-2 pointer-events-auto">
              <FolderArchive className="w-4 h-4 text-surface-500" />
              Upload ZIP
            </span>
          </div>
        </div>

        {/* Transparent Loader Overlay when processing uploaded/unzipped files */}
        {isUploading && (
          <div className="absolute inset-0 bg-white/90 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center gap-3 z-30 animate-fade-in pointer-events-auto">
            <div className="w-12 h-12 items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-sm sm:text-base text-surface-900">Processing & Extracting Files...</h4>
              <p className="text-xs sm:text-sm text-surface-500 mt-1">Reading images from upload package</p>
            </div>
          </div>
        )}
      </div>

      {/* Compression Control Panel */}
      <div className="bg-white border border-surface-200 rounded-2xl p-6 sm:p-8 shadow-subtle flex flex-col gap-6">
        
        {/* Preset Selector Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-surface-100">
          <div className="flex items-center gap-2.5">
            <Settings2 className="w-5 h-5 text-brand-600" />
            <h4 className="font-bold text-base text-surface-900">Compression Presets</h4>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: '50 KB', value: 50 },
              { label: '100 KB', value: 100 },
              { label: '200 KB', value: 200 },
              { label: '500 KB', value: 500 },
              { label: '1 MB', value: 1024 },
              { label: '2 MB', value: 2048 },
            ].map((p) => (
              <button
                key={p.label}
                suppressHydrationWarning
                onClick={() => handleSettingChange(() => { setMode('targetSize'); setPresetKb(p.value); })}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  mode === 'targetSize' && presetKb === p.value
                    ? 'bg-brand-600 text-white shadow-subtle'
                    : 'bg-surface-100 text-surface-700 border border-surface-200 hover:bg-surface-200'
                }`}
              >
                {p.label}
              </button>
            ))}

            <button
              suppressHydrationWarning
              onClick={() => handleSettingChange(() => setMode('quality'))}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                mode === 'quality'
                  ? 'bg-brand-600 text-white shadow-subtle'
                  : 'bg-surface-100 text-surface-700 border border-surface-200 hover:bg-surface-200'
              }`}
            >
              Custom Quality
            </button>
          </div>
        </div>

        {/* Dynamic Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          
          {/* Target Size or Quality Setting */}
          {mode === 'targetSize' ? (
            <div className="flex flex-col gap-2">
              <label className="text-xs sm:text-sm font-semibold text-surface-700 flex justify-between">
                <span>Target File Size</span>
                <span className="font-bold text-brand-600">{presetKb >= 1024 ? `${(presetKb / 1024).toFixed(1)} MB` : `${presetKb} KB`}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max="10000"
                  value={presetKb}
                  onChange={(e) => handleSettingChange(() => setPresetKb(Number(e.target.value)))}
                  className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm sm:text-base font-semibold text-surface-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-colors"
                />
                <span className="text-xs sm:text-sm text-surface-500 font-semibold">KB</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-xs sm:text-sm font-semibold text-surface-700 flex justify-between">
                <span>Compression Quality</span>
                <span className="font-bold text-brand-600">{quality}%</span>
              </label>
              <input
                type="range"
                min="5"
                max="95"
                value={quality}
                onChange={(e) => handleSettingChange(() => setQuality(Number(e.target.value)))}
                className="w-full my-auto"
              />
            </div>
          )}

          {/* Scale / Resize */}
          <div className="flex flex-col gap-2">
            <label className="text-xs sm:text-sm font-semibold text-surface-700 flex justify-between">
              <span>Resolution Scaling</span>
              <span className="font-bold text-brand-600">{scalePercent}%</span>
            </label>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={scalePercent}
              onChange={(e) => handleSettingChange(() => setScalePercent(Number(e.target.value)))}
              className="w-full my-auto"
            />
          </div>

          {/* Format Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs sm:text-sm font-semibold text-surface-700">Output Format</label>
            <select
              value={format}
              onChange={(e) => handleSettingChange(() => setFormat(e.target.value))}
              className="w-full px-3.5 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm sm:text-base font-semibold text-surface-900 focus:outline-none focus:border-brand-600 focus:bg-white transition-colors"
            >
              <option value="original">Keep Original Format</option>
              <option value="image/webp">WEBP (Highly Recommended)</option>
              <option value="image/jpeg">JPG / JPEG</option>
              <option value="image/png">PNG</option>
              <option value="image/avif">AVIF</option>
            </select>
          </div>
        </div>

        

        {/* Action Trigger Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
          <div>
            {files.length > 0 ? (
              <div className="flex flex-col gap-1">
                <p className="font-bold text-surface-900 text-sm sm:text-base">
                  Original Size: <span className="text-surface-600 font-semibold">{formatBytes(totalOriginalSize)}</span> → Expected Output: <span className="text-brand-600 font-extrabold">{formatBytes(totalEstimatedOutputBytes)}</span>
                </p>
                <p className="text-xs sm:text-sm text-surface-600">
                  You will save approx. <strong className="text-success-600 font-bold">{formatBytes(totalEstimatedSavedBytes)}</strong> ({totalEstimatedSavedPercent}% smaller)
                </p>
                <p className="text-xs sm:text-sm text-surface-600 font-semibold mt-0.5">
                  Total Uploaded: <span className="font-bold text-surface-900">{files.length} {files.length === 1 ? 'image' : 'images'}</span>
                </p>
              </div>
            ) : (
              <span className="text-xs sm:text-sm text-surface-500 font-medium">Upload images or a ZIP file above to begin compression</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {files.length > 0 && (
              <button
                onClick={clearAll}
                disabled={isProcessing}
                className="px-4 py-2.5 text-surface-600 hover:text-danger hover:bg-danger-50 rounded-xl font-semibold text-xs sm:text-sm transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </button>
            )}

            <button
              onClick={runCompression}
              disabled={files.length === 0 || isProcessing}
              className={`px-6 py-3 rounded-xl font-bold text-sm sm:text-base text-white shadow-subtle flex items-center gap-2.5 transition-all ${
                files.length === 0 || isProcessing
                  ? 'bg-surface-300 cursor-not-allowed'
                  : 'bg-brand-600 hover:bg-brand-700 shadow-md hover:scale-[1.01]'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Compressing... ({progress}%)</span>
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  <span>Compress Images</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* Batch Progress Bar */}
      {isProcessing && (
        <div className="w-full bg-surface-100 rounded-full h-2 overflow-hidden border border-surface-200 animate-fade-in">
          <div 
            className="bg-brand-600 h-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* File List & Output Summary */}
      {files.length > 0 && (
        <div className="flex flex-col gap-4 animate-fade-in">
          
          {/* Summary Header */}
          {successCount > 0 && (
            <div className="bg-success-50 border border-success/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success text-white flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-surface-900">
                    Successfully Compressed {successCount} File{successCount > 1 ? 's' : ''}!
                  </h4>
                  <p className="text-xs text-surface-600 mt-0.5">
                    Original <span className="line-through">{formatBytes(totalOriginalSize)}</span> → Final Output <strong className="text-surface-900 font-bold">{formatBytes(totalCompressedSize)}</strong> (Saved <strong className="text-success-600">{formatBytes(totalSavedBytes)}</strong> / {totalSavedPercent}% smaller)
                  </p>
                </div>
              </div>

              <button
                onClick={() => downloadAllAsZip(files, 'compressed_images.zip')}
                className="px-4 py-2.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg font-semibold text-xs shadow-subtle flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download All as ZIP</span>
              </button>
            </div>
          )}

          {/* Cards Stack */}
          <div className="flex flex-col gap-2.5">
            {files.map((file) => {
              const estimate = calculateEstimate(file.originalSize);
              const fileWithEstimate = {
                ...file,
                estimatedOutputText: estimate.estText,
                estimatedSavedText: estimate.estSavedText
              };

              return (
                <FileCard 
                  key={file.id} 
                  item={fileWithEstimate} 
                  onRemove={removeFile} 
                />
              );
            })}
          </div>

        </div>
      )}

    </div>
  );
}

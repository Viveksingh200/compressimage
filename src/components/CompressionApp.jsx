import React, { useState, useRef, useEffect } from 'react';
import { Upload, FolderArchive, RefreshCw, Download, Zap, Settings2, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import FileCard from './FileCard';
import { compressSingleImage } from '../utils/compressorEngine';
import { processInputFiles, formatBytes } from '../utils/fileHandler';
import { downloadAllAsZip } from '../utils/zipGenerator';

export default function CompressionApp({ initialPreset = 'custom', initialFormat = 'original' }) {
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Helper to parse initial preset
  const parseInitialPreset = (preset) => {
    if (!preset) return { mode: 'quality', kb: 200 };
    const p = String(preset).toLowerCase().trim();
    if (p === 'custom' || p === 'quality') {
      return { mode: 'quality', kb: 200 };
    }
    if (p.includes('mb')) {
      const num = parseFloat(p);
      return { mode: 'targetSize', kb: Math.round(num * 1024) };
    }
    if (p.includes('kb')) {
      const num = parseInt(p, 10);
      return { mode: 'targetSize', kb: num || 200 };
    }
    const parsedNum = parseInt(p, 10);
    if (!isNaN(parsedNum)) {
      return { mode: 'targetSize', kb: parsedNum };
    }
    return { mode: 'quality', kb: 200 };
  };

  const initialParsed = parseInitialPreset(initialPreset);

  // Compression Controls
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState(initialFormat || 'original');
  const [scalePercent, setScalePercent] = useState(100);
  const [mode, setMode] = useState(initialParsed.mode);
  const [presetKb, setPresetKb] = useState(initialParsed.kb);

  // Preset definitions
  const allPresets = [
    { label: '50 KB', value: 50 },
    { label: '100 KB', value: 100 },
    { label: '200 KB', value: 200 },
    { label: '500 KB', value: 500 },
    { label: '1 MB', value: 1024 },
    { label: '2 MB', value: 2048 },
  ];

  // If original size of image is less than a preset button, remove that button
  const maxOriginalSize = files.length > 0 ? Math.max(...files.map(f => f.originalSize || 0)) : Infinity;
  const visiblePresets = allPresets.filter(p => files.length === 0 || maxOriginalSize >= (p.value * 1024));

  // Auto-switch away from presets that are larger than the uploaded image
  useEffect(() => {
    if (files.length > 0 && mode === 'targetSize') {
      const maxOriginal = Math.max(...files.map(f => f.originalSize || 0));
      const available = allPresets.filter(p => maxOriginal >= (p.value * 1024));
      if (available.length > 0 && !available.some(p => p.value === presetKb)) {
        setPresetKb(available[available.length - 1].value);
      } else if (available.length === 0) {
        setMode('quality');
      }
    }
  }, [files, mode, presetKb]);

  const fileInputRef = useRef(null);
  const uploadedSectionRef = useRef(null);
  const prevFilesLength = useRef(files.length);

  useEffect(() => {
    if (files.length > 0 && prevFilesLength.current === 0) {
      setTimeout(() => {
        uploadedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
    prevFilesLength.current = files.length;
  }, [files.length]);

  // Drag & Drop Handlers
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
      await processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = async (fileList) => {
    setIsUploading(true);
    try {
      const parsedItems = await processInputFiles(fileList);
      setFiles((prev) => [...prev, ...parsedItems]);
    } catch (err) {
      console.error("Error processing files:", err);
    } finally {
      setIsUploading(false);
    }
  };

  // Live real-time probe to measure the exact canvas compressed byte size whenever sliders move
  useEffect(() => {
    if (files.length === 0) return;

    let isMounted = true;
    const probeTimer = setTimeout(async () => {
      const targetKbToUse = mode === 'targetSize' ? presetKb : null;

      const probedFiles = await Promise.all(
        files.map(async (f) => {
          try {
            const probeResult = await compressSingleImage(f, {
              targetSizeKB: targetKbToUse,
              quality: quality / 100,
              format,
              scalePercent,
            });
            return {
              id: f.id,
              estimatedSize: probeResult.compressedSize,
              probedResult: probeResult
            };
          } catch (e) {
            return { id: f.id, estimatedSize: null, probedResult: null };
          }
        })
      );

      if (isMounted) {
        setFiles((prev) =>
          prev.map((item) => {
            const probed = probedFiles.find(p => p.id === item.id);
            if (!probed || !probed.estimatedSize) return item;
            return {
              ...item,
              estimatedSize: probed.estimatedSize,
              probedResult: probed.probedResult
            };
          })
        );
      }
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(probeTimer);
    };
  }, [quality, format, scalePercent, mode, presetKb, files.length]);

  // Run Compression for all pending files
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
        let compressedResult;
        if (current.probedResult && current.probedResult.status === 'success') {
          compressedResult = current.probedResult;
        } else {
          compressedResult = await compressSingleImage(current, {
            targetSizeKB: targetKbToUse,
            quality: quality / 100,
            format,
            scalePercent,
          });
        }

        // Micro delay for smooth progress rendering
        await new Promise((r) => setTimeout(r, 60));

        updatedFiles[i] = {
          ...current,
          ...compressedResult,
          status: 'success'
        };
      } catch (err) {
        console.error("Compression error for file:", current.name, err);
        updatedFiles[i] = { ...current, status: 'error' };
      }

      const percent = Math.round(((i + 1) / updatedFiles.length) * 100);
      setProgress(percent);
      setFiles([...updatedFiles]);
    }

    // Keep progress visible at 100%
    await new Promise((r) => setTimeout(r, 150));
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

  // Compute Estimated Target Output Size (KB/MB) for loaded files
  const calculateEstimate = (file) => {
    if (!file) return { estBytes: 0, estText: '0 KB', estSavedText: '0 KB (0% saved)' };
    const fileOriginalSize = file.originalSize || 0;

    // 1. If file is already successfully compressed, expected output is exact actual output!
    if (file.status === 'success' && file.compressedSize) {
      const saved = Math.max(0, fileOriginalSize - file.compressedSize);
      const percent = fileOriginalSize > 0 ? Math.round((saved / fileOriginalSize) * 100) : 0;
      return {
        estBytes: file.compressedSize,
        estText: formatBytes(file.compressedSize),
        estSavedText: `${formatBytes(saved)} (${percent}% saved)`
      };
    }

    // 2. If live probed real size is available, use exact probed size!
    if (file.estimatedSize) {
      const estBytes = file.estimatedSize;
      const estSaved = Math.max(0, fileOriginalSize - estBytes);
      const estPercent = fileOriginalSize > 0 ? Math.round((estSaved / fileOriginalSize) * 100) : 0;
      return {
        estBytes,
        estText: formatBytes(estBytes),
        estSavedText: `${formatBytes(estSaved)} (${estPercent}% saved)`
      };
    }

    // 3. Fallback calculation while initial probe is running
    let estBytes = 0;
    if (mode === 'targetSize') {
      const targetBytes = presetKb * 1024;
      estBytes = Math.min(fileOriginalSize, targetBytes);
    } else {
      const q = quality / 100;
      const s = scalePercent / 100;
      if (file.width && file.height) {
        const totalPixels = (file.width * s) * (file.height * s);
        const bytesPerPixel = 0.015 + Math.pow(q, 2.2) * 0.13;
        estBytes = Math.min(fileOriginalSize, Math.max(1024, Math.round(totalPixels * bytesPerPixel)));
      } else {
        const ratio = 0.04 + Math.pow(q, 2.0) * 0.20 * s;
        estBytes = Math.min(fileOriginalSize, Math.max(1024, Math.round(fileOriginalSize * ratio)));
      }
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
  const successCount = files.filter((f) => f.status === 'success').length;

  // Overall Stats
  const totalOriginalSize = files.reduce((acc, f) => acc + (f.originalSize || 0), 0);
  const totalCompressedSize = files.reduce((acc, f) => acc + (f.compressedSize || f.originalSize || 0), 0);
  const totalSavedBytes = Math.max(0, totalOriginalSize - totalCompressedSize);
  const totalSavedPercent = totalOriginalSize > 0 
    ? Math.round((totalSavedBytes / totalOriginalSize) * 100) 
    : 0;

  // Compute live estimated bytes dynamically from real probed sizes
  const totalEstimatedOutputBytes = files.reduce((acc, f) => {
    return acc + calculateEstimate(f).estBytes;
  }, 0);

  const totalEstimatedSavedBytes = Math.max(0, totalOriginalSize - totalEstimatedOutputBytes);
  const totalEstimatedSavedPercent = totalOriginalSize > 0 
    ? Math.round((totalEstimatedSavedBytes / totalOriginalSize) * 100) 
    : 0;

  // Helper to update settings and enable live estimation & re-compression
  const handleSettingChange = (changeFn) => {
    changeFn();
    setProgress(0);
    if (hasSuccessFiles) {
      setFiles(prev => prev.map(f => ({
        ...f,
        status: 'pending',
        probedResult: null,
        estimatedSize: null,
        compressedBlob: null,
        compressedSize: null,
        compressedUrl: null
      })));
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
      
      {/* Upload Dropzone */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 bg-white dark:bg-[#131b2e] ${
          isDragging 
            ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/30 shadow-md scale-[1.005]' 
            : 'border-surface-200 dark:border-surface-700/80 hover:border-brand-500/50 dark:hover:border-brand-400/50 hover:bg-surface-50/50 dark:hover:bg-[#162038] shadow-subtle'
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
          <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-900/60 flex items-center justify-center shadow-subtle">
            <Upload className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-surface-900 dark:text-white tracking-tight">
              Drop your images or ZIP file here
            </h3>
            <p className="text-sm sm:text-base text-surface-500 dark:text-surface-400 mt-1.5 font-medium">
              Supports JPG, PNG, WebP, AVIF & ZIP archives. 100% private in browser.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <span className="px-5 py-2.5 bg-brand-600 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-subtle hover:bg-brand-700 transition-colors flex items-center gap-2 pointer-events-auto">
              <Upload className="w-4 h-4" />
              Browse Files
            </span>
            <span className="px-5 py-2.5 bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200 font-semibold text-xs sm:text-sm rounded-xl border border-surface-200 dark:border-surface-700 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors flex items-center gap-2 pointer-events-auto">
              <FolderArchive className="w-4 h-4 text-surface-500 dark:text-surface-400" />
              Upload ZIP
            </span>
          </div>
        </div>

        {/* Loader Overlay when processing uploaded/unzipped files */}
        {isUploading && (
          <div className="absolute inset-0 bg-white/90 dark:bg-[#131b2e]/90 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center gap-3 z-30 animate-fade-in pointer-events-auto">
            <div className="w-12 h-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-brand-600 dark:text-brand-400" />
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-sm sm:text-base text-surface-900 dark:text-white">Processing & Extracting Files...</h4>
              <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 mt-1">Reading images from upload package</p>
            </div>
          </div>
        )}
      </div>

      {/* Uploaded Section: Appears once files are uploaded */}
      {files.length > 0 && (
        <div ref={uploadedSectionRef} className="flex flex-col gap-6 animate-fade-in">
          
          {/* Compression Control Panel */}
          <div className="bg-white dark:bg-[#131b2e] border border-surface-200 dark:border-surface-800 rounded-2xl p-6 sm:p-8 shadow-subtle flex flex-col gap-6 transition-colors">
            
            {/* Preset Selector Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-surface-100 dark:border-surface-800/80">
              <div className="flex items-center gap-2.5">
                <Settings2 className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                <h4 className="font-bold text-base text-surface-900 dark:text-white">Compression Presets</h4>
              </div>

              {/* Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {visiblePresets.map((p) => (
                  <button
                    key={p.label}
                    suppressHydrationWarning
                    onClick={() => handleSettingChange(() => { setMode('targetSize'); setPresetKb(p.value); })}
                    className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      mode === 'targetSize' && presetKb === p.value
                        ? 'bg-brand-600 text-white shadow-subtle'
                        : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:bg-surface-200 dark:hover:bg-surface-700'
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
                      : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:bg-surface-200 dark:hover:bg-surface-700'
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
                  <label className="text-xs sm:text-sm font-semibold text-surface-700 dark:text-surface-300 flex justify-between">
                    <span>Target File Size</span>
                    <span className="font-bold text-brand-600 dark:text-brand-400">{presetKb >= 1024 ? `${(presetKb / 1024).toFixed(1)} MB` : `${presetKb} KB`}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="10"
                      max="10000"
                      value={presetKb}
                      onChange={(e) => handleSettingChange(() => setPresetKb(Number(e.target.value)))}
                      className="w-full px-3.5 py-2.5 bg-surface-50 dark:bg-[#0e1626] border border-surface-200 dark:border-surface-700 rounded-xl text-sm sm:text-base font-semibold text-surface-900 dark:text-white focus:outline-none focus:border-brand-600 focus:bg-white dark:focus:bg-[#0e1626] transition-colors"
                    />
                    <span className="text-xs sm:text-sm text-surface-500 dark:text-surface-400 font-semibold">KB</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-xs sm:text-sm font-semibold text-surface-700 dark:text-surface-300 flex justify-between">
                    <span>Compression Quality</span>
                    <span className="font-bold text-brand-600 dark:text-brand-400">{quality}%</span>
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
                <label className="text-xs sm:text-sm font-semibold text-surface-700 dark:text-surface-300 flex justify-between">
                  <span>Resolution Scaling</span>
                  <span className="font-bold text-brand-600 dark:text-brand-400">{scalePercent}%</span>
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
                <label className="text-xs sm:text-sm font-semibold text-surface-700 dark:text-surface-300">Output Format</label>
                <select
                  value={format}
                  onChange={(e) => handleSettingChange(() => setFormat(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-surface-50 dark:bg-[#0e1626] border border-surface-200 dark:border-surface-700 rounded-xl text-sm sm:text-base font-semibold text-surface-900 dark:text-white focus:outline-none focus:border-brand-600 focus:bg-white dark:focus:bg-[#0e1626] transition-colors"
                >
                  <option value="original">Keep Original Format</option>
                  <option value="image/webp">WEBP (Highly Recommended)</option>
                  <option value="image/jpeg">JPG / JPEG</option>
                  <option value="image/png">PNG</option>
                  <option value="image/avif">AVIF</option>
                </select>
              </div>
            </div>

            {/* Summary Bar & Compress Trigger */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-surface-100 dark:border-surface-800/80">
              <div className="flex flex-col gap-1">
                {hasSuccessFiles ? (
                  <>
                    <p className="font-bold text-surface-900 dark:text-white text-sm sm:text-base">
                      Original Size: <span className="text-surface-600 dark:text-surface-400 font-semibold">{formatBytes(totalOriginalSize)}</span> → Output Size: <span className="text-brand-600 dark:text-brand-400 font-extrabold">{formatBytes(totalCompressedSize)}</span>
                    </p>
                    <p className="text-xs sm:text-sm text-surface-600 dark:text-surface-400">
                      Saved <strong className="text-success-600 dark:text-success font-bold">{formatBytes(totalSavedBytes)}</strong> ({totalSavedPercent}% smaller)
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-surface-900 dark:text-white text-sm sm:text-base">
                      Original Size: <span className="text-surface-600 dark:text-surface-400 font-semibold">{formatBytes(totalOriginalSize)}</span> → Expected Output: <span className="text-brand-600 dark:text-brand-400 font-extrabold">{formatBytes(totalEstimatedOutputBytes)}</span>
                    </p>
                    <p className="text-xs sm:text-sm text-surface-600 dark:text-surface-400">
                      You will save approx. <strong className="text-success-600 dark:text-success font-bold">{formatBytes(totalEstimatedSavedBytes)}</strong> ({totalEstimatedSavedPercent}% smaller)
                    </p>
                  </>
                )}
                <p className="text-xs sm:text-sm text-surface-600 dark:text-surface-400 font-semibold mt-0.5">
                  Total Uploaded: <span className="font-bold text-surface-900 dark:text-white">{files.length} {files.length === 1 ? 'image' : 'images'}</span>
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={clearAll}
                  disabled={isProcessing}
                  className="px-4 py-2.5 text-surface-600 dark:text-surface-400 hover:text-danger hover:bg-danger-50 dark:hover:bg-danger-950/40 rounded-xl font-semibold text-xs sm:text-sm transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </button>

                <button
                  onClick={runCompression}
                  disabled={isProcessing}
                  className={`px-6 py-3 rounded-xl font-bold text-sm sm:text-base text-white shadow-subtle flex items-center gap-2.5 transition-all ${
                    isProcessing
                      ? 'bg-surface-300 dark:bg-surface-700 cursor-not-allowed'
                      : 'bg-brand-600 hover:bg-brand-700 shadow-md hover:scale-[1.01]'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Compressing...</span>
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

          {/* Compressed Batch Result Banner */}
          {successCount > 0 && (
            <div className="bg-success-50 dark:bg-emerald-950/30 border border-success/20 dark:border-emerald-800/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success text-white flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-surface-900 dark:text-white">
                    Successfully Compressed {successCount} File{successCount > 1 ? 's' : ''}!
                  </h4>
                  <p className="text-xs text-surface-600 dark:text-surface-300 mt-0.5">
                    Original <span className="line-through">{formatBytes(totalOriginalSize)}</span> → Final Output <strong className="text-surface-900 dark:text-white font-bold">{formatBytes(totalCompressedSize)}</strong> (Saved <strong className="text-success-600 dark:text-success font-bold">{formatBytes(totalSavedBytes)}</strong> / {totalSavedPercent}% smaller)
                  </p>
                </div>
              </div>

              <button
                onClick={() => downloadAllAsZip(files, 'compressed_images.zip')}
                className="px-4 py-2.5 bg-surface-900 dark:bg-surface-100 hover:bg-surface-800 dark:hover:bg-white text-white dark:text-surface-900 rounded-lg font-semibold text-xs shadow-subtle flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download All as ZIP</span>
              </button>
            </div>
          )}

          {/* Cards Stack List */}
          <div className="flex flex-col gap-2.5">
            {files.map((file) => {
              const estimate = calculateEstimate(file);
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

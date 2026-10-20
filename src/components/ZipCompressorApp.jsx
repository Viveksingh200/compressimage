import React, { useState, useRef, useEffect } from 'react';
import { 
  FolderArchive, 
  Upload, 
  Download, 
  Sparkles, 
  ShieldCheck, 
  FileImage, 
  FileText, 
  FileCode, 
  File, 
  ArrowRight, 
  CheckCircle2, 
  Loader2, 
  Trash2, 
  RefreshCw, 
  Layers, 
  Sliders, 
  Info,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { inspectZipArchive, compressZipArchive, getFileCategory } from '../utils/zipCompressorEngine';
import { formatBytes } from '../utils/fileHandler';

export default function ZipCompressorApp() {
  const [archiveData, setArchiveData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Compression settings
  const [mode, setMode] = useState('smart'); // 'smart' | 'lossless' | 'webp'
  const [imageQuality, setImageQuality] = useState(80);
  const [scalePercent, setScalePercent] = useState(100);
  const [customZipName, setCustomZipName] = useState('');

  // Results
  const [result, setResult] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fileInputRef = useRef(null);
  const resultsRef = useRef(null);

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
      await handleIncomingFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      e.target.value = '';
      await handleIncomingFiles(selected);
    }
  };

  const handleIncomingFiles = async (fileList) => {
    setErrorMsg('');
    setResult(null);
    setProgress(0);

    const files = Array.from(fileList);
    const firstFile = files[0];
    const isZip = firstFile.name.toLowerCase().endsWith('.zip') || 
                  firstFile.type === 'application/zip' || 
                  firstFile.type === 'application/x-zip-compressed';

    setIsAnalyzing(true);

    try {
      if (isZip) {
        // Inspect ZIP Archive
        const inspected = await inspectZipArchive(firstFile);
        if (inspected.entries.length === 0) {
          setErrorMsg('The uploaded ZIP archive is empty or could not be read.');
          setIsAnalyzing(false);
          return;
        }
        setArchiveData(inspected);
        setCustomZipName(firstFile.name.replace(/\.zip$/i, '_compressed.zip'));
      } else {
        // Multi-file packing into ZIP
        const entries = files.map((f) => ({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          relativePath: f.name,
          fileName: f.name,
          size: f.size,
          isImage: /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name) || f.type.startsWith('image/'),
          category: getFileCategory(f.name),
          rawBlob: f
        }));

        const totalSize = files.reduce((acc, f) => acc + f.size, 0);

        setArchiveData({
          archiveName: files.length === 1 ? `${files[0].name}.zip` : 'archive_bundle.zip',
          originalZipSize: totalSize,
          totalUncompressedSize: totalSize,
          totalFiles: entries.length,
          entries
        });
        setCustomZipName('compressed_archive.zip');
      }
    } catch (err) {
      console.error('Failed to read archive:', err);
      setErrorMsg('Failed to read the ZIP file. Please ensure it is a valid, unencrypted ZIP file.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartCompression = async () => {
    if (!archiveData) return;

    setIsCompressing(true);
    setProgress(0);
    setStatusMessage('Optimizing archive contents...');

    try {
      const compressionResult = await compressZipArchive(
        archiveData,
        {
          mode,
          imageQuality,
          scalePercent
        },
        (pct, msg) => {
          setProgress(pct);
          if (msg) setStatusMessage(msg);
        }
      );

      setResult(compressionResult);

      // Trigger celebration confetti
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 150);
    } catch (err) {
      console.error('Compression error:', err);
      setErrorMsg('An error occurred during compression. Please try again.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!result || !result.zipBlob) return;

    const downloadName = customZipName.trim() || 'compressed_archive.zip';
    const finalName = downloadName.toLowerCase().endsWith('.zip') ? downloadName : `${downloadName}.zip`;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(result.zipBlob);
    link.download = finalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    setArchiveData(null);
    setResult(null);
    setErrorMsg('');
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Filter entries for explorer
  const displayedEntries = (result?.fileStats || archiveData?.entries || []).filter((item) => {
    if (!searchFilter) return true;
    return item.relativePath.toLowerCase().includes(searchFilter.toLowerCase());
  });

  const imageCount = archiveData?.entries.filter((e) => e.isImage).length || 0;

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'image':
        return <FileImage className="w-4 h-4 text-blue-500" />;
      case 'document':
        return <FileText className="w-4 h-4 text-amber-500" />;
      case 'code':
        return <FileCode className="w-4 h-4 text-emerald-500" />;
      case 'archive':
        return <FolderArchive className="w-4 h-4 text-purple-500" />;
      default:
        return <File className="w-4 h-4 text-surface-400" />;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      
      {/* Upload Dropzone */}
      {!archiveData && (
        <label
          htmlFor="zip-archive-upload-input"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative block border-2 border-dashed rounded-2xl p-8 sm:p-14 text-center cursor-pointer transition-all duration-200 group bg-white/70 dark:bg-[#111928]/70 backdrop-blur-sm shadow-subtle ${
            isDragging
              ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 scale-[1.01]'
              : 'border-surface-300 dark:border-surface-700 hover:border-brand-500 dark:hover:border-brand-500 hover:bg-surface-50/80 dark:hover:bg-[#141f33]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            multiple
            onChange={handleFileSelect}
            className="sr-only"
            id="zip-archive-upload-input"
            tabIndex={-1}
          />

          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-brand-50 dark:bg-brand-950/60 border border-brand-100 dark:border-brand-900/60 flex items-center justify-center text-brand-600 dark:text-brand-400 group-hover:scale-110 transition-transform shadow-subtle">
              {isAnalyzing ? (
                <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 animate-spin" />
              ) : (
                <FolderArchive className="w-8 h-8 sm:w-10 sm:h-10" />
              )}
            </div>

            <div className="space-y-1.5 max-w-md">
              <p className="text-lg sm:text-xl font-bold text-surface-900 dark:text-white">
                {isAnalyzing ? 'Analyzing ZIP Archive...' : 'Drop your ZIP file here'}
              </p>
              <p className="text-xs sm:text-sm text-surface-500 dark:text-surface-400">
                or <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }} className="text-brand-600 dark:text-brand-400 font-semibold underline underline-offset-2 hover:text-brand-700 dark:hover:text-brand-300 cursor-pointer">browse from your computer</button>. Supports all .zip files, mixed folders, or batch files.
              </p>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-subtle transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Browse from your computer
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] font-medium text-surface-500 dark:text-surface-400">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> 100% Client-Side
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
                <Sparkles className="w-3.5 h-3.5 text-brand-500" /> Maximum DEFLATE 9
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
                <Layers className="w-3.5 h-3.5 text-purple-500" /> Smart Media Re-compression
              </span>
            </div>
          </div>
        </label>
      )}

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-sm flex items-center justify-between animate-fade-in">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="text-xs underline hover:no-underline font-semibold ml-3">
            Dismiss
          </button>
        </div>
      )}

      {/* Archive Loaded & Ready to Configure */}
      {archiveData && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-[#131b2e] border border-surface-200 dark:border-surface-800 shadow-card">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-950/60 border border-brand-100 dark:border-brand-900/60 flex items-center justify-center text-brand-600 dark:text-brand-400 flex-shrink-0">
                <FolderArchive className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-surface-900 dark:text-white truncate">
                  {archiveData.archiveName}
                </h3>
                <div className="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                  <span className="font-medium">{formatBytes(archiveData.originalZipSize)}</span>
                  <span>•</span>
                  <span>{archiveData.totalFiles} files</span>
                  {imageCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-brand-600 dark:text-brand-400 font-medium">{imageCount} images inside</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 text-xs font-semibold text-surface-600 dark:text-surface-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-800/80 rounded-lg transition-colors border border-surface-200 dark:border-surface-700 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Upload Another ZIP</span>
              </button>
            </div>
          </div>

          {/* Result Banner (if compression completed) */}
          {result && (
            <div ref={resultsRef} className="p-6 rounded-2xl bg-gradient-to-br from-brand-50 via-white to-emerald-50 dark:from-[#0f172a] dark:via-[#131b2e] dark:to-[#0f2420] border-2 border-emerald-500/40 dark:border-emerald-500/30 shadow-card animate-fade-in">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-subtle flex-shrink-0">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        ZIP Successfully Compressed!
                      </span>
                      {result.savedPercent > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-emerald-600 text-white shadow-subtle animate-pulse-subtle">
                          -{result.savedPercent}% Smaller
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-baseline gap-3 mt-1.5">
                      <span className="text-2xl sm:text-3xl font-extrabold text-surface-900 dark:text-white">
                        {formatBytes(result.compressedSize)}
                      </span>
                      <span className="text-sm text-surface-400 line-through">
                        {formatBytes(result.originalSize)}
                      </span>
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        (Saved {formatBytes(result.savedBytes)})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="w-full md:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-sm rounded-xl transition-all shadow-card flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Compressed ZIP</span>
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* Compression Configuration Panel */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131b2e] border border-surface-200 dark:border-surface-800 shadow-card space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-base font-bold text-surface-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  Select Compression Strategy
                </h4>
                <span className="text-xs text-surface-500 dark:text-surface-400">Level 9 DEFLATE enabled</span>
              </div>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                Choose how you want the files inside your ZIP archive to be processed.
              </p>
            </div>

            {/* Mode Option Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              
              {/* Option 1: Smart Deep Compression */}
              <button
                type="button"
                onClick={() => setMode('smart')}
                className={`p-4 rounded-xl text-left border-2 transition-all flex flex-col justify-between relative ${
                  mode === 'smart'
                    ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/40 text-surface-900 dark:text-white shadow-subtle'
                    : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700 text-surface-700 dark:text-surface-300 bg-surface-50/50 dark:bg-[#0e1626]/60'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="w-7 h-7 rounded-lg bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 flex items-center justify-center font-bold text-xs">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-brand-600 text-white">
                    Recommended
                  </span>
                </div>
                <div>
                  <h5 className="font-bold text-sm text-surface-900 dark:text-white">Smart Deep Compress</h5>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 leading-relaxed">
                    Optimizes embedded images + applies Deflate 9 to all docs, text & code. Best balance.
                  </p>
                </div>
              </button>

              {/* Option 2: Lossless Deflate Max */}
              <button
                type="button"
                onClick={() => setMode('lossless')}
                className={`p-4 rounded-xl text-left border-2 transition-all flex flex-col justify-between relative ${
                  mode === 'lossless'
                    ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/40 text-surface-900 dark:text-white shadow-subtle'
                    : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700 text-surface-700 dark:text-surface-300 bg-surface-50/50 dark:bg-[#0e1626]/60'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-600 text-white">
                    100% Exact
                  </span>
                </div>
                <div>
                  <h5 className="font-bold text-sm text-surface-900 dark:text-white">Lossless Deflate 9</h5>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 leading-relaxed">
                    Re-encodes all files with maximum DEFLATE 9 without modifying a single bit of raw data.
                  </p>
                </div>
              </button>

              {/* Option 3: WebP Ultra Compress */}
              <button
                type="button"
                onClick={() => setMode('webp')}
                className={`p-4 rounded-xl text-left border-2 transition-all flex flex-col justify-between relative ${
                  mode === 'webp'
                    ? 'border-brand-600 bg-brand-50/50 dark:bg-brand-950/40 text-surface-900 dark:text-white shadow-subtle'
                    : 'border-surface-200 dark:border-surface-800 hover:border-surface-300 dark:hover:border-surface-700 text-surface-700 dark:text-surface-300 bg-surface-50/50 dark:bg-[#0e1626]/60'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-xs">
                    <Layers className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-600 text-white">
                    Ultra Light
                  </span>
                </div>
                <div>
                  <h5 className="font-bold text-sm text-surface-900 dark:text-white">Images to WebP</h5>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 leading-relaxed">
                    Converts JPG & PNG images to WebP inside the archive for maximum possible space savings.
                  </p>
                </div>
              </button>

            </div>

            {/* Fine Tuning Controls (when mode != lossless) */}
            {mode !== 'lossless' && (
              <div className="p-4 rounded-xl bg-surface-50 dark:bg-[#0e1626]/70 border border-surface-200 dark:border-surface-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-surface-700 dark:text-surface-300">
                    Internal Image Quality: <span className="text-brand-600 dark:text-brand-400">{imageQuality}%</span>
                  </span>
                  <span className="text-[11px] text-surface-500 dark:text-surface-400">
                    {imageQuality >= 80 ? 'High Fidelity' : imageQuality >= 60 ? 'Balanced' : 'Maximum Compression'}
                  </span>
                </div>

                <input
                  type="range"
                  min="20"
                  max="95"
                  value={imageQuality}
                  onChange={(e) => setImageQuality(Number(e.target.value))}
                  className="w-full"
                />

                {/* Target size preset pills */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="font-semibold text-surface-700 dark:text-surface-300">Target Size Goal:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setImageQuality(85); setScalePercent(100); }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-500 text-surface-700 dark:text-surface-300 transition-colors"
                    >
                      ~2 MB / High Quality
                    </button>
                    <button
                      type="button"
                      onClick={() => { setImageQuality(70); setScalePercent(80); }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-500 text-surface-700 dark:text-surface-300 transition-colors"
                    >
                      ~500 KB / Balanced
                    </button>
                    <button
                      type="button"
                      onClick={() => { setImageQuality(50); setScalePercent(50); }}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-500 text-surface-700 dark:text-surface-300 transition-colors"
                    >
                      ~100 KB / Max Compression
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-surface-200 dark:border-surface-800 text-xs">
                  <span className="font-semibold text-surface-700 dark:text-surface-300">Image Resolution Scaling:</span>
                  <div className="flex items-center gap-1.5">
                    {[100, 80, 50].map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        onClick={() => setScalePercent(scale)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                          scalePercent === scale
                            ? 'bg-brand-600 text-white shadow-subtle'
                            : 'bg-white dark:bg-surface-800 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-700 hover:bg-surface-100'
                        }`}
                      >
                        {scale === 100 ? 'Original (100%)' : `${scale}% Scale`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Output ZIP Name */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <label className="text-xs font-bold text-surface-700 dark:text-surface-300 whitespace-nowrap">
                Output ZIP Filename:
              </label>
              <input
                type="text"
                value={customZipName}
                onChange={(e) => setCustomZipName(e.target.value)}
                placeholder="compressed_archive.zip"
                className="w-full sm:max-w-xs px-3 py-1.5 text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Processing Progress Bar */}
            {isCompressing && (
              <div className="space-y-2 animate-fade-in">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-surface-700 dark:text-surface-300 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />
                    {statusMessage || 'Compressing archive...'}
                  </span>
                  <span className="text-brand-600 dark:text-brand-400 font-bold">{progress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 transition-all duration-150 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Main Action Button */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isCompressing}
                onClick={handleStartCompression}
                className="w-full py-4 bg-brand-600 hover:bg-brand-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base rounded-xl transition-all shadow-card flex items-center justify-center gap-2 cursor-pointer"
              >
                {isCompressing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Compressing ZIP Archive ({progress}%)...</span>
                  </>
                ) : (
                  <>
                    <FolderArchive className="w-5 h-5" />
                    <span>Compress ZIP File Now</span>
                  </>
                )}
              </button>
            </div>

          </div>

          {/* Archive Contents Explorer */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131b2e] border border-surface-200 dark:border-surface-800 shadow-card space-y-4">
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-surface-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  Archive File Explorer ({archiveData.totalFiles} items)
                </h4>
                <p className="text-xs text-surface-500 dark:text-surface-400">
                  Full directory breakdown of the files inside this ZIP archive.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter files by name..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* File List Table */}
            <div className="border border-surface-200 dark:border-surface-800 rounded-xl overflow-hidden">
              <div className="max-h-72 overflow-y-auto divide-y divide-surface-100 dark:divide-surface-800/80">
                {displayedEntries.length === 0 ? (
                  <div className="p-8 text-center text-xs text-surface-400">
                    No files match your search criteria.
                  </div>
                ) : (
                  displayedEntries.map((entry, idx) => (
                    <div
                      key={entry.id || idx}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {getCategoryIcon(entry.category)}
                        <span className="font-medium text-surface-900 dark:text-white truncate font-mono text-[11px]">
                          {entry.relativePath}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {result && entry.savedPercent !== undefined ? (
                          <div className="flex items-center gap-2">
                            <span className="text-surface-400 line-through text-[11px]">
                              {formatBytes(entry.originalSize)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-surface-400" />
                            <span className="font-bold text-surface-900 dark:text-white font-mono text-[11px]">
                              {formatBytes(entry.newSize)}
                            </span>
                            {entry.savedPercent > 0 ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                                -{entry.savedPercent}%
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 dark:bg-surface-800 text-surface-500">
                                Deflate 9
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-surface-500 dark:text-surface-400 text-[11px]">
                            {formatBytes(entry.size)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}

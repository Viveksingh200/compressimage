import JSZip from 'jszip';

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;

export function getFileCategory(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'svg'].includes(ext)) return 'image';
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages'].includes(ext)) return 'document';
  if (['json', 'xml', 'csv', 'yaml', 'yml', 'tsv', 'sql', 'md'].includes(ext)) return 'data';
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'py', 'java', 'c', 'cpp', 'rs', 'go', 'php', 'sh'].includes(ext)) return 'code';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archive';
  return 'file';
}

/**
 * Inspect an uploaded ZIP file and return structured entries.
 */
export async function inspectZipArchive(zipFile) {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(zipFile);
  const entries = [];
  let totalUncompressedSize = 0;

  for (const relativePath of Object.keys(loadedZip.files)) {
    const entry = loadedZip.files[relativePath];
    if (entry.dir) continue; // Skip directory markers

    // Get approximate size or read content length
    const blob = await entry.async('blob');
    const size = blob.size;
    totalUncompressedSize += size;

    const fileName = relativePath.split('/').pop() || relativePath;
    const isImage = IMAGE_EXTENSIONS.test(fileName);
    const category = getFileCategory(fileName);

    entries.push({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      relativePath,
      fileName,
      size,
      isImage,
      category,
      rawBlob: blob,
      entry
    });
  }

  return {
    archiveName: zipFile.name,
    originalZipSize: zipFile.size,
    totalUncompressedSize,
    totalFiles: entries.length,
    entries
  };
}

/**
 * Compresses an image blob using Canvas API.
 */
async function optimizeImageBlob(blob, format = 'original', quality = 0.8, scalePercent = 100) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (scalePercent < 100) {
          const scale = scalePercent / 100;
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: true });

        if (!ctx) {
          return resolve({ blob, changed: false });
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let targetMime = blob.type || 'image/jpeg';
        if (format === 'webp') {
          targetMime = 'image/webp';
        } else if (format === 'jpeg' || format === 'jpg') {
          targetMime = 'image/jpeg';
        }

        canvas.toBlob(
          (optimizedBlob) => {
            if (optimizedBlob && optimizedBlob.size < blob.size) {
              resolve({ blob: optimizedBlob, mimeType: targetMime, changed: true });
            } else {
              // If optimization did not reduce size, preserve original
              resolve({ blob, changed: false });
            }
          },
          targetMime,
          quality
        );
      } catch (err) {
        console.warn('Canvas optimization error:', err);
        resolve({ blob, changed: false });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ blob, changed: false });
    };

    img.src = url;
  });
}

/**
 * Re-compresses the ZIP archive with selected strategy and maximum DEFLATE 9.
 */
export async function compressZipArchive(inspectedData, options = {}, onProgress = () => {}) {
  const {
    mode = 'smart', // 'smart' | 'lossless' | 'webp'
    imageQuality = 80, // 10 to 100
    scalePercent = 100 // 25 to 100
  } = options;

  const newZip = new JSZip();
  const entries = inspectedData.entries;
  const total = entries.length;
  const fileStats = [];

  const qualityRatio = Math.max(0.1, Math.min(1.0, imageQuality / 100));

  for (let i = 0; i < total; i++) {
    const item = entries[i];
    const progressPercent = Math.round(((i + 1) / total) * 90);
    onProgress(progressPercent, item.fileName);

    let outputBlob = item.rawBlob;
    let outputPath = item.relativePath;
    let isOptimized = false;

    if (item.isImage && (mode === 'smart' || mode === 'webp')) {
      const targetFormat = mode === 'webp' ? 'webp' : 'original';
      const result = await optimizeImageBlob(
        item.rawBlob,
        targetFormat,
        qualityRatio,
        scalePercent
      );

      if (result.changed) {
        outputBlob = result.blob;
        isOptimized = true;
        if (mode === 'webp' && !outputPath.toLowerCase().endsWith('.webp')) {
          outputPath = outputPath.replace(/\.[^/.]+$/, '.webp');
        }
      }
    }

    newZip.file(outputPath, outputBlob);

    fileStats.push({
      relativePath: outputPath,
      fileName: outputPath.split('/').pop() || outputPath,
      originalSize: item.size,
      newSize: outputBlob.size,
      category: item.category,
      isImage: item.isImage,
      isOptimized,
      savedBytes: Math.max(0, item.size - outputBlob.size),
      savedPercent: item.size > 0 ? Math.round(((item.size - outputBlob.size) / item.size) * 100) : 0
    });

    // Keep event loop responsive
    if (i % 3 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress(95, 'Building final DEFLATE archive...');

  // Generate ultra-compressed ZIP archive with DEFLATE level 9
  const compressedZipBlob = await newZip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9
      }
    },
    (metadata) => {
      const genProgress = 90 + Math.round((metadata.percent / 100) * 10);
      onProgress(Math.min(99, genProgress), 'Packaging ZIP stream...');
    }
  );

  onProgress(100, 'Complete!');

  const originalSize = inspectedData.originalZipSize || inspectedData.totalUncompressedSize;
  const compressedSize = compressedZipBlob.size;
  const savedBytes = Math.max(0, originalSize - compressedSize);
  const savedPercent = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;

  return {
    zipBlob: compressedZipBlob,
    originalSize,
    compressedSize,
    savedBytes,
    savedPercent,
    totalFiles: entries.length,
    fileStats
  };
}

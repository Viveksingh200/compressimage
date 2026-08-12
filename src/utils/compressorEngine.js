/**
 * High precision client-side image compression engine using HTML5 Canvas & Binary Search fitting.
 */

export async function compressSingleImage(imageItem, options = {}) {
  const {
    targetSizeKB = null, // e.g. 100 for 100KB
    quality = 0.80,       // 0.01 to 1.00
    format = 'original',  // 'original', 'image/jpeg', 'image/webp', 'image/png', 'image/avif'
    scalePercent = 100,  // 10 to 100
    maxWidth = null,
    maxHeight = null,
  } = options;

  // Load image from URL into HTMLImageElement
  const img = await loadImage(imageItem.previewUrl);
  let srcWidth = img.naturalWidth || img.width;
  let srcHeight = img.naturalHeight || img.height;

  // Determine output format
  let mimeType = format;
  if (format === 'original') {
    mimeType = imageItem.type || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(mimeType)) {
      mimeType = 'image/jpeg';
    }
  }

  // Calculate target dimensions
  let scale = (scalePercent || 100) / 100;
  if (maxWidth && srcWidth > maxWidth) {
    scale = Math.min(scale, maxWidth / srcWidth);
  }
  if (maxHeight && srcHeight > maxHeight) {
    scale = Math.min(scale, maxHeight / srcHeight);
  }

  let canvasWidth = Math.max(1, Math.round(srcWidth * scale));
  let canvasHeight = Math.max(1, Math.round(srcHeight * scale));

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { alpha: mimeType !== 'image/jpeg' });

  // Fill white background for JPEGs if needed
  if (mimeType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

  // IF Target Size Mode is requested (e.g., targetSizeKB = 200)
  if (targetSizeKB && targetSizeKB > 0) {
    const targetBytes = targetSizeKB * 1024;
    return await compressToTargetSize({
      canvas,
      img,
      initialWidth: canvasWidth,
      initialHeight: canvasHeight,
      mimeType,
      targetBytes,
      originalSize: imageItem.originalSize
    });
  }

  // ELSE Fixed Quality Mode
  // Note: HTML5 Canvas `canvas.toBlob('image/png')` ignores the quality argument because PNG is lossless.
  // If PNG format is requested and quality < 0.95 or scaling is applied, we fallback to WEBP (or JPEG if no alpha)
  // so that lossy quality compression actually reduces file size instead of bloating it.
  let targetMime = mimeType;
  if (mimeType === 'image/png' && (quality < 0.95 || scalePercent < 100)) {
    const hasAlpha = checkCanvasAlpha(ctx, canvasWidth, canvasHeight);
    targetMime = hasAlpha ? 'image/webp' : 'image/jpeg';
    if (targetMime === 'image/jpeg') {
      // Re-fill white bg for JPEG conversion
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
  }

  let finalBlob = await canvasToBlob(canvas, targetMime, quality);

  // If blob failed or PNG output grew larger than original file size, force WEBP compression
  if (!finalBlob || (targetMime === 'image/png' && finalBlob.size >= imageItem.originalSize)) {
    targetMime = 'image/webp';
    finalBlob = await canvasToBlob(canvas, targetMime, quality);
  }

  const compressedSize = finalBlob ? finalBlob.size : imageItem.originalSize;
  const compressedUrl = finalBlob ? URL.createObjectURL(finalBlob) : imageItem.previewUrl;
  const savedBytes = Math.max(0, imageItem.originalSize - compressedSize);
  const savedPercent = imageItem.originalSize > 0 
    ? Math.max(0, Math.round((savedBytes / imageItem.originalSize) * 100))
    : 0;

  return {
    ...imageItem,
    compressedBlob: finalBlob,
    compressedSize,
    compressedUrl,
    savedBytes,
    savedPercent,
    width: canvasWidth,
    height: canvasHeight,
    qualityUsed: Math.round(quality * 100),
    outputFormat: targetMime.split('/')[1].toUpperCase(),
    status: 'success'
  };
}

/**
 * Binary search quality & dimension scaling engine to match target file size KB.
 */
async function compressToTargetSize({ canvas, img, initialWidth, initialHeight, mimeType, targetBytes, originalSize }) {
  let currentWidth = initialWidth;
  let currentHeight = initialHeight;
  let workCanvas = canvas;

  // For target size compression on PNGs, use WebP or JPEG because HTML canvas PNG export ignores quality settings
  let targetMime = mimeType === 'image/png' ? 'image/webp' : mimeType;

  let bestBlob = null;
  let bestQuality = 0.85;

  // Run up to 4 dimension scaling passes if image resolution is huge
  for (let pass = 0; pass < 4; pass++) {
    let minQ = 0.05;
    let maxQ = 0.95;
    let iterations = 0;

    while (minQ <= maxQ && iterations < 8) {
      iterations++;
      const midQ = (minQ + maxQ) / 2;
      const testBlob = await canvasToBlob(workCanvas, targetMime, midQ);

      if (!testBlob) break;

      if (testBlob.size <= targetBytes) {
        bestBlob = testBlob;
        bestQuality = midQ;
        // Try to get higher quality while remaining <= targetBytes
        minQ = midQ + 0.04;
      } else {
        // Blob is too large, lower the quality
        maxQ = midQ - 0.04;
      }
    }

    // If we found a valid blob under target size, break pass loop!
    if (bestBlob && bestBlob.size <= targetBytes) {
      break;
    }

    // If still over targetBytes even at low quality, scale down canvas resolution by 20% and retry pass
    currentWidth = Math.max(16, Math.round(currentWidth * 0.80));
    currentHeight = Math.max(16, Math.round(currentHeight * 0.80));

    workCanvas = document.createElement('canvas');
    workCanvas.width = currentWidth;
    workCanvas.height = currentHeight;
    const ctx = workCanvas.getContext('2d', { alpha: targetMime !== 'image/jpeg' });
    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, currentWidth, currentHeight);
    }
    ctx.drawImage(img, 0, 0, currentWidth, currentHeight);
  }

  // Fallback if even small scale produces no blob
  if (!bestBlob) {
    bestBlob = await canvasToBlob(workCanvas, targetMime, 0.1);
  }

  const compressedSize = bestBlob ? bestBlob.size : originalSize;
  const compressedUrl = bestBlob ? URL.createObjectURL(bestBlob) : '';
  const savedBytes = Math.max(0, originalSize - compressedSize);
  const savedPercent = originalSize > 0 
    ? Math.max(0, Math.round((savedBytes / originalSize) * 100))
    : 0;

  return {
    compressedBlob: bestBlob,
    compressedSize,
    compressedUrl,
    savedBytes,
    savedPercent,
    width: currentWidth,
    height: currentHeight,
    qualityUsed: Math.round(bestQuality * 100),
    outputFormat: targetMime.split('/')[1].toUpperCase(),
    status: 'success'
  };
}

function checkCanvasAlpha(ctx, width, height) {
  try {
    const sampleWidth = Math.min(width, 100);
    const sampleHeight = Math.min(height, 100);
    const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    for (let i = 3; i < imgData.length; i += 4) {
      if (imgData[i] < 255) return true;
    }
  } catch (e) {}
  return false;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      type,
      quality
    );
  });
}

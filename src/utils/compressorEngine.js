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
    // Fallback unsupported types to webp
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

  // Create offscreen or regular canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { alpha: mimeType !== 'image/jpeg' });

  // White background for JPEG if transparency present
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
    });
  }

  // ELSE fixed quality mode
  let finalBlob = await canvasToBlob(canvas, mimeType, quality);

  // Fallback if browser doesn't support requested format export (e.g. AVIF fallback to WEBP)
  if (!finalBlob) {
    mimeType = 'image/webp';
    finalBlob = await canvasToBlob(canvas, mimeType, quality);
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
    outputFormat: mimeType.split('/')[1].toUpperCase(),
    status: 'success'
  };
}

/**
 * Binary search quality & dimension scaling engine to match target file size KB.
 */
async function compressToTargetSize({ canvas, img, initialWidth, initialHeight, mimeType, targetBytes }) {
  let currentWidth = initialWidth;
  let currentHeight = initialHeight;
  let workCanvas = canvas;
  let targetMime = mimeType === 'image/png' ? 'image/webp' : mimeType; // PNG quality cannot be adjusted by browser canvas quality param

  let bestBlob = null;
  let bestQuality = 0.85;

  // Run up to 3 dimension scaling passes if image resolution is huge
  for (let pass = 0; pass < 3; pass++) {
    let minQ = 0.05;
    let maxQ = 0.95;
    let iterations = 0;

    while (minQ <= maxQ && iterations < 7) {
      iterations++;
      const midQ = (minQ + maxQ) / 2;
      const testBlob = await canvasToBlob(workCanvas, targetMime, midQ);

      if (!testBlob) break;

      if (testBlob.size <= targetBytes) {
        bestBlob = testBlob;
        bestQuality = midQ;
        // Try to get higher quality while remaining <= targetBytes
        minQ = midQ + 0.05;
      } else {
        // Blob is too large, lower the quality
        maxQ = midQ - 0.05;
      }
    }

    // If we found a valid blob under target size, break pass loop!
    if (bestBlob && bestBlob.size <= targetBytes) {
      break;
    }

    // If still over targetBytes even at low quality, scale down canvas resolution by 25% and retry pass
    currentWidth = Math.max(16, Math.round(currentWidth * 0.75));
    currentHeight = Math.max(16, Math.round(currentHeight * 0.75));

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

  const compressedSize = bestBlob ? bestBlob.size : targetBytes;
  const compressedUrl = bestBlob ? URL.createObjectURL(bestBlob) : '';

  return {
    compressedBlob: bestBlob,
    compressedSize,
    compressedUrl,
    width: currentWidth,
    height: currentHeight,
    qualityUsed: Math.round(bestQuality * 100),
    outputFormat: targetMime.split('/')[1].toUpperCase(),
    status: 'success'
  };
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

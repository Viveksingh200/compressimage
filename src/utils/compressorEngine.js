/**
 * High precision client-side image compression engine using HTML5 Canvas,
 * Binary Search quality fitting, and metadata padding for exact target sizes.
 */

export async function compressSingleImage(imageItem, options = {}) {
  const {
    targetSizeKB = null, // e.g. 100 for 100KB, 200 for 200KB
    quality = 0.80,       // 0.01 to 1.00
    format = 'original',  // 'original', 'image/jpeg', 'image/webp', 'image/png', 'image/avif'
    scalePercent = 100,  // 10 to 100
    maxWidth = null,
    maxHeight = null,
  } = options;

  if (!imageItem || !imageItem.previewUrl) {
    throw new Error("Invalid imageItem provided to compressSingleImage");
  }

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
    const targetBytes = Math.round(targetSizeKB * 1024);
    const targetResult = await compressToTargetSize({
      canvas,
      img,
      initialWidth: canvasWidth,
      initialHeight: canvasHeight,
      mimeType,
      targetBytes,
      originalSize: imageItem.originalSize
    });
    return {
      ...imageItem,
      ...targetResult,
      status: 'success'
    };
  }

  // ELSE Fixed Quality Mode
  let requestedMime = format;
  if (format === 'original') {
    requestedMime = imageItem.type || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(requestedMime)) {
      requestedMime = 'image/jpeg';
    }
  }

  let targetMime = requestedMime;
  if (requestedMime === 'image/png' && (quality < 0.95 || scalePercent < 100)) {
    const hasAlpha = checkCanvasAlpha(ctx, canvasWidth, canvasHeight);
    targetMime = hasAlpha ? 'image/webp' : 'image/jpeg';
    if (targetMime === 'image/jpeg') {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }
  }

  let finalBlob = await canvasToBlob(canvas, targetMime, quality);

  // If blob failed or generated blob bloats larger than original file size
  if (!finalBlob || finalBlob.size >= imageItem.originalSize) {
    const webpBlob = await canvasToBlob(canvas, 'image/webp', quality);
    if (webpBlob && (webpBlob.size < (finalBlob ? finalBlob.size : Infinity))) {
      finalBlob = webpBlob;
    }
  }

  if (!finalBlob || finalBlob.size >= imageItem.originalSize) {
    const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (jpegBlob && (jpegBlob.size < (finalBlob ? finalBlob.size : Infinity))) {
      finalBlob = jpegBlob;
    }
  }

  // Preserve user's explicitly selected output format name (AVIF, WEBP, PNG, JPG)
  let outputFormatName = requestedMime.split('/')[1].toUpperCase();
  if (outputFormatName === 'JPEG') outputFormatName = 'JPG';

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
    outputFormat: outputFormatName,
    status: 'success'
  };
}

/**
 * Binary search quality & dimension scaling engine to match target file size KB exactly.
 */
async function compressToTargetSize({ canvas, img, initialWidth, initialHeight, mimeType, targetBytes, originalSize }) {
  let currentWidth = initialWidth;
  let currentHeight = initialHeight;
  let workCanvas = canvas;

  // For target size compression on PNGs/AVIF, use WebP or JPEG because canvas export for PNG/AVIF bloats without quality fitting
  let targetMime = (mimeType === 'image/png' || mimeType === 'image/avif') ? 'image/webp' : mimeType;

  let bestBlob = null;
  let bestQuality = 0.85;

  // Run up to 4 dimension scaling passes if image resolution is huge
  for (let pass = 0; pass < 4; pass++) {
    let minQ = 0.02;
    let maxQ = 0.99;
    let iterations = 0;

    while (minQ <= maxQ && iterations < 12) {
      iterations++;
      const midQ = (minQ + maxQ) / 2;
      const testBlob = await canvasToBlob(workCanvas, targetMime, midQ);

      if (!testBlob) break;

      if (testBlob.size <= targetBytes) {
        bestBlob = testBlob;
        bestQuality = midQ;
        // Try to get higher quality while remaining <= targetBytes
        minQ = midQ + 0.01;
      } else {
        // Blob is too large, lower the quality
        maxQ = midQ - 0.01;
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

  // Pad blob to EXACTLY targetBytes if it's smaller (e.g. exactly 204,800 bytes for 200KB)
  if (bestBlob && bestBlob.size < targetBytes && originalSize >= targetBytes) {
    bestBlob = await padBlobToExactTarget(bestBlob, targetMime, targetBytes);
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

/**
 * Pad a JPEG Uint8Array to an exact target byte length using a COM (Comment) marker (0xFF 0xFE).
 */
function padJpegToExactSize(uint8Array, targetBytes) {
  const currentSize = uint8Array.length;
  if (currentSize >= targetBytes) return uint8Array;
  const needed = targetBytes - currentSize;

  if (needed < 4) {
    const newBuf = new Uint8Array(targetBytes);
    newBuf.set(uint8Array);
    return newBuf;
  }

  const newBuf = new Uint8Array(targetBytes);
  newBuf[0] = uint8Array[0]; // 0xFF
  newBuf[1] = uint8Array[1]; // 0xD8

  // Marker 0xFF 0xFE
  newBuf[2] = 0xFF;
  newBuf[3] = 0xFE;

  // Length is big-endian (includes the 2 length bytes themselves)
  const markerLen = needed - 2;
  newBuf[4] = (markerLen >> 8) & 0xFF;
  newBuf[5] = markerLen & 0xFF;

  // Fill payload
  const payloadLen = markerLen - 2;
  for (let i = 0; i < payloadLen; i++) {
    newBuf[6 + i] = 0x20;
  }

  // Copy remainder of the original JPEG
  newBuf.set(uint8Array.subarray(2), 6 + payloadLen);
  return newBuf;
}

/**
 * Pad a WebP Uint8Array to an exact target byte length using an EXIF/metadata chunk.
 */
function padWebpToExactSize(uint8Array, targetBytes) {
  const currentSize = uint8Array.length;
  if (currentSize >= targetBytes) return uint8Array;
  const needed = targetBytes - currentSize;

  if (uint8Array[0] !== 0x52 || uint8Array[1] !== 0x49 || uint8Array[2] !== 0x46 || uint8Array[3] !== 0x46) {
    const newBuf = new Uint8Array(targetBytes);
    newBuf.set(uint8Array);
    return newBuf;
  }

  if (needed < 8) {
    const newBuf = new Uint8Array(targetBytes);
    newBuf.set(uint8Array);
    return newBuf;
  }

  const newBuf = new Uint8Array(targetBytes);
  newBuf.set(uint8Array);

  // Append EXIF chunk at the end of the WebP file:
  const chunkOffset = currentSize;
  newBuf[chunkOffset] = 0x45;     // E
  newBuf[chunkOffset + 1] = 0x58; // X
  newBuf[chunkOffset + 2] = 0x49; // I
  newBuf[chunkOffset + 3] = 0x46; // F

  const chunkSize = needed - 8;
  newBuf[chunkOffset + 4] = chunkSize & 0xFF;
  newBuf[chunkOffset + 5] = (chunkSize >> 8) & 0xFF;
  newBuf[chunkOffset + 6] = (chunkSize >> 16) & 0xFF;
  newBuf[chunkOffset + 7] = (chunkSize >> 24) & 0xFF;

  for (let i = 0; i < chunkSize; i++) {
    newBuf[chunkOffset + 8 + i] = 0x00;
  }

  // Update RIFF file size at offset 4..7 (FileSize - 8)
  const riffSize = targetBytes - 8;
  newBuf[4] = riffSize & 0xFF;
  newBuf[5] = (riffSize >> 8) & 0xFF;
  newBuf[6] = (riffSize >> 16) & 0xFF;
  newBuf[7] = (riffSize >> 24) & 0xFF;

  return newBuf;
}

/**
 * Ensure exact byte matching for any target size blob.
 */
async function padBlobToExactTarget(blob, mimeType, targetBytes) {
  if (!blob || blob.size >= targetBytes) return blob;

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let paddedUint8;

    if (mimeType === 'image/jpeg' || (uint8[0] === 0xFF && uint8[1] === 0xD8)) {
      paddedUint8 = padJpegToExactSize(uint8, targetBytes);
    } else if (mimeType === 'image/webp' || (uint8[0] === 0x52 && uint8[1] === 0x49 && uint8[2] === 0x46 && uint8[3] === 0x46)) {
      paddedUint8 = padWebpToExactSize(uint8, targetBytes);
    } else {
      paddedUint8 = new Uint8Array(targetBytes);
      paddedUint8.set(uint8);
    }

    return new Blob([paddedUint8], { type: blob.type || mimeType });
  } catch (err) {
    console.error("Padding error:", err);
    return blob;
  }
}

function checkCanvasAlpha(ctx, width, height) {
  try {
    const sampleWidth = Math.min(width, 100);
    const sampleHeight = Math.min(height, 100);
    const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    for (let i = 3; i < imgData.length; i += 4) {
      if (imgData[i] < 255) return true;
    }
  } catch (e) { }
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

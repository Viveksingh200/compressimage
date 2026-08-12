import JSZip from 'jszip';

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const SUPPORTED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;

export async function processInputFiles(fileList) {
  const processed = [];
  const filesArray = Array.from(fileList);

  for (const file of filesArray) {
    const isZip = file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

    if (isZip) {
      try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        for (const relativePath of Object.keys(zipContent.files)) {
          const zipEntry = zipContent.files[relativePath];
          if (!zipEntry.dir && SUPPORTED_IMAGE_EXTENSIONS.test(zipEntry.name)) {
            const blob = await zipEntry.async('blob');
            const fileName = zipEntry.name.split('/').pop() || zipEntry.name;
            const ext = fileName.split('.').pop().toLowerCase();
            const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'avif' ? 'image/avif' : 'image/jpeg';
            
            const extractedFile = new File([blob], fileName, { type: mimeType });
            const previewUrl = URL.createObjectURL(extractedFile);

            processed.push({
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              file: extractedFile,
              name: fileName,
              originalSize: extractedFile.size,
              type: extractedFile.type || mimeType,
              previewUrl,
              isFromZip: true,
              zipName: file.name,
              relativePath
            });
          }
        }
      } catch (err) {
        console.error("Error unzipping file:", err);
      }
    } else if (SUPPORTED_IMAGE_EXTENSIONS.test(file.name) || file.type.startsWith('image/')) {
      const previewUrl = URL.createObjectURL(file);
      processed.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        name: file.name,
        originalSize: file.size,
        type: file.type || 'image/jpeg',
        previewUrl,
        isFromZip: false
      });
    }
  }

  return processed;
}

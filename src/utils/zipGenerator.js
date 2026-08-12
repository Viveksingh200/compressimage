import JSZip from 'jszip';

export async function downloadAllAsZip(fileItems, zipFilename = 'compressed_images.zip') {
  const zip = new JSZip();

  for (const item of fileItems) {
    if (!item.compressedBlob) continue;
    
    let fileName = item.name;
    // Update file extension if format changed
    if (item.outputFormat) {
      const ext = item.outputFormat.toLowerCase() === 'jpeg' ? 'jpg' : item.outputFormat.toLowerCase();
      const parts = fileName.split('.');
      if (parts.length > 1) {
        parts.pop();
        fileName = `${parts.join('.')}.${ext}`;
      } else {
        fileName = `${fileName}.${ext}`;
      }
    }

    // Add prefix to avoid overwriting
    const nameInZip = item.isFromZip ? `${item.zipName ? item.zipName.replace('.zip', '') + '/' : ''}${fileName}` : `compressed_${fileName}`;
    zip.file(nameInZip, item.compressedBlob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  
  // Trigger file download in browser
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

import type { CertificationDocument } from '@/domain/types';

// Scans are stored as base64 inside IndexedDB — fine for a demo, not for real
// documents (base64 inflates size ~33%, and the whole string loads into memory
// on every read). The cap stays low for that reason; see the README.
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readDocument(file: File): Promise<CertificationDocument> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error(`Files must be ${formatBytes(MAX_DOCUMENT_BYTES)} or smaller.`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });

  // `readAsDataURL` yields `data:<mime>;base64,<payload>`; only the payload is
  // stored, so the prefix cannot drift out of sync with the recorded mime type.
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);

  return {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    data: payload,
  };
}

export function toDownloadHref(document: CertificationDocument): string {
  return `data:${document.mimeType};base64,${document.data}`;
}

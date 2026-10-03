/**
 * Document uploads. The type a browser reports for a chosen file comes from the operating system's file-type
 * registry, and on some Windows machines it is empty or wrong for perfectly good PDFs and photos. So the type is
 * decided from the file extension here (and the server then checks the actual bytes), never from `file.type`.
 */
const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Value for <input type="file" accept>: extensions first (what Windows file dialogs filter on), MIME types as a fallback. */
export const DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

export const DOCUMENT_TYPES_LABEL = 'PDF, PNG or JPEG';

/** The MIME type for a document file name, or null when the extension is not an accepted document type. */
export function documentMimeType(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? null : (BY_EXTENSION[fileName.slice(dot + 1).toLowerCase()] ?? null);
}

/** Problem with a chosen file, or undefined when it can be uploaded. */
export function documentFileProblem(file: { name: string; size: number }): string | undefined {
  if (!documentMimeType(file.name)) return `File must be a ${DOCUMENT_TYPES_LABEL}`;
  if (file.size > DOCUMENT_MAX_BYTES) return 'File must be 10MB or smaller';
  if (file.size === 0) return 'The file is empty';
  return undefined;
}

/** The same bytes with a correct type attached, ready for FormData (a File whose type was blank is re-labelled). */
export function normalizeDocumentFile(file: File): File {
  const type = documentMimeType(file.name);
  return type && file.type !== type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

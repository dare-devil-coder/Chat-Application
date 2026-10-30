// Files bigger than this (or of a type that cannot be shown inside the chat)
// are not attached to the message but sent as a download link.
export const LARGE_LIMIT = 25 * 1024 * 1024;
export const MAX_LARGE_MB = 500;

// Types the chat can show directly: photos, videos, audio and common documents
const INLINE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'mp4', 'webm', 'mov',
  'weba', 'ogg', 'oga', 'mp3', 'wav', 'm4a', 'aac',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip',
]);

export const extensionOf = (name: string) =>
  name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';

export const needsLink = (file: File) =>
  file.size > LARGE_LIMIT || !INLINE_EXTENSIONS.has(extensionOf(file.name));

// How long a download link stays valid
export const EXPIRY_OPTIONS = [
  { label: '1 hour', seconds: 3600 },
  { label: '1 day', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
];
export const DEFAULT_EXPIRY = 604800;
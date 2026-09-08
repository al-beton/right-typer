// Portable uncompressed USTAR: one download, no third-party archive runtime.
const encoder = new TextEncoder();
export async function archive(files: Record<string, Blob>): Promise<Blob> {
  const parts: BlobPart[] = [];
  for (const [name, blob] of Object.entries(files)) {
    if (!/^[a-zA-Z0-9._/-]+$/.test(name) || name.includes('..') || name.length > 99)
      throw new Error(`Invalid archive path: ${name}`);
    const header = new Uint8Array(512);
    const write = (at: number, value: string) => header.set(encoder.encode(value), at);
    const octal = (value: number, length: number) =>
      value.toString(8).padStart(length - 1, '0') + '\0';
    write(0, name);
    write(100, '0000600\0');
    write(108, '0000000\0');
    write(116, '0000000\0');
    write(124, octal(blob.size, 12));
    write(136, '00000000000\0');
    write(148, '        ');
    write(156, '0');
    write(257, 'ustar\0');
    write(263, '00');
    write(
      148,
      header
        .reduce((sum, byte) => sum + byte, 0)
        .toString(8)
        .padStart(6, '0') + '\0 ',
    );
    parts.push(header, blob, new Uint8Array((512 - (blob.size % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  return new Blob(parts, { type: 'application/x-tar' });
}
export function unarchive(bytes: Uint8Array): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = Object.create(null);
  const decoder = new TextDecoder();
  for (let offset = 0; offset + 512 <= bytes.length; ) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number) =>
      decoder
        .decode(header.subarray(start, start + length))
        .replace(/\0.*$/s, '')
        .trim();
    const name = field(0, 100);
    const sum = header.reduce((total, byte, i) => total + (i >= 148 && i < 156 ? 32 : byte), 0);
    const size = parseInt(field(124, 12), 8);
    if (
      sum !== parseInt(field(148, 8), 8) ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      offset + 512 + size > bytes.length
    )
      throw new Error('Corrupt or truncated sample archive');
    if (
      !/^[a-zA-Z0-9._/-]+$/.test(name) ||
      name.includes('..') ||
      name.startsWith('/') ||
      name in files ||
      field(156, 1) !== '0'
    )
      throw new Error(`Unsafe or duplicate sample file: ${name}`);
    files[name] = new Uint8Array(bytes.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
export async function sha256(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

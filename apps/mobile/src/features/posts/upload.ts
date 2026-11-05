/**
 * PUTs a local file to a presigned URL with upload progress (fetch has no progress events).
 * Resolves on 2xx; rejects with a friendly message otherwise. Abort via the returned signal.
 */
export function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}). Please try again.`));
    xhr.onerror = () => reject(new Error('Upload interrupted. Check your connection and retry.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Please retry.'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(body);
  });
}

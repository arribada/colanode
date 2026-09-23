// ABOUTME: Hands a blob or a local URL to the browser as a file download; the
// ABOUTME: one place that builds the throwaway <a download> every export uses.

export const downloadUrl = (url: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  // Revoked late on purpose: the browser reads the blob after the click
  // returns, and revoking straight away cancels the download on Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

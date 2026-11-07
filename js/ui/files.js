// Saving files (backups, spreadsheets) and opening a backup file.
// On iPhone this opens the Share sheet, where he can pick "Save to Files",
// AirDrop, Mail, and so on. Elsewhere it downloads the file.

/** Resolves 'shared', 'downloaded' or 'cancelled'. */
export async function saveFile(fileName, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const file = new File([blob], fileName, { type: mimeType });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Sharing failed for another reason: fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

/** Let him pick a file; resolves its text, or null if he cancels. */
export function pickTextFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) { resolve(null); return; }
      if (file.size > 20 * 1024 * 1024) { resolve({ error: 'That file is too big to be a Budget backup.' }); return; }
      resolve({ text: await file.text(), name: file.name });
    });
    input.addEventListener('cancel', () => { input.remove(); resolve(null); });
    document.body.append(input);
    input.click();
  });
}

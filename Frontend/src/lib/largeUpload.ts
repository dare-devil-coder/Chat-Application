// Uploads a big file to the server in small pieces ("chunks") and returns the
// token of the finished file. Steps: start -> send every chunk -> complete.
const MAX_ATTEMPTS = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export async function uploadLarge(
  apiUrl: string,
  file: File,
  userId: number,
  expiresIn: number,
  onProgress: (percent: number) => void
): Promise<string> {
  // 1) Tell the server about the file; it answers with the chunk size
  const startRes = await fetch(`${apiUrl}/api/large/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      filename: file.name,
      size: file.size,
      expires_in: expiresIn,
    }),
  });
  if (!startRes.ok) throw new Error(await readError(startRes, 'Could not start the upload'));
  const { upload_id, chunk_size, total_chunks } = await startRes.json();

  // 2) Send the chunks one after another; a failed chunk is retried up to 3 times
  onProgress(0);
  for (let index = 0; index < total_chunks; index++) {
    const piece = file.slice(index * chunk_size, Math.min((index + 1) * chunk_size, file.size));
    let sent = false;
    let lastError = 'Upload failed';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !sent; attempt++) {
      try {
        const res = await fetch(
          `${apiUrl}/api/large/${upload_id}/chunk/${index}?user_id=${userId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: piece,
          }
        );
        if (!res.ok) throw new Error(await readError(res, 'Chunk upload failed'));
        sent = true;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Upload failed';
        if (attempt < MAX_ATTEMPTS) await wait(500 * attempt);
      }
    }
    if (!sent) throw new Error(lastError);
    onProgress(Math.round(((index + 1) / total_chunks) * 100));
  }

  // 3) Ask the server to put the pieces together
  const doneRes = await fetch(`${apiUrl}/api/large/${upload_id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!doneRes.ok) throw new Error(await readError(doneRes, 'Could not finish the upload'));
  const done = await doneRes.json();
  return done.token as string;
}
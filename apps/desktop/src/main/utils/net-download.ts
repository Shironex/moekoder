import * as fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Writable } from 'node:stream';

export interface DownloadProgress {
  /** Integer 0-100. */
  percent: number;
  /** Bytes written to disk so far. */
  downloaded: number;
  /**
   * Total bytes to download, from the `Content-Length` header. `0` when the
   * server didn't advertise a length (chunked transfer) — callers should
   * treat 0 as "unknown" and fall back to the percent-only display.
   */
  total: number;
}

/**
 * Download a URL to a file using Node 22's native `fetch`. Streams the
 * response body to disk through a `Writable`, so memory use stays flat
 * regardless of payload size. Reports progress via the optional callback
 * when `Content-Length` is known — bytes and percent travel together so
 * UIs can render an "X / Y MB" counter without re-deriving the total.
 *
 * The write stream is created eagerly and closed on any error path so a
 * half-written file is never left behind by the pipeline — callers are
 * expected to unlink the destination themselves on failure.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}: ${url}`);
  }
  if (!response.body) {
    throw new Error(`Download had no response body: ${url}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
  let downloaded = 0;
  // Track the last integer pct we emitted so we don't spam the caller (and,
  // downstream, IPC) with identical values for every write — on a fast
  // network chunks land far faster than the rounded pct changes.
  let lastReportedPct = -1;

  const fileStream = fs.createWriteStream(destPath);

  // Count bytes passing through before they land on disk so we can emit a
  // smooth progress stream without peeking at the file size.
  const progressTap = new Writable({
    write(chunk: Buffer, _enc, callback) {
      downloaded += chunk.length;
      if (contentLength > 0 && onProgress) {
        const pct = Math.min(100, Math.round((downloaded / contentLength) * 100));
        if (pct !== lastReportedPct) {
          lastReportedPct = pct;
          onProgress({ percent: pct, downloaded, total: contentLength });
        }
      }
      fileStream.write(chunk, err => {
        if (err) callback(err);
        else callback();
      });
    },
    final(callback) {
      fileStream.end(callback);
    },
  });

  // `Readable.fromWeb` bridges `fetch`'s WHATWG stream into a Node stream so
  // we can pipe it through the tap. Node 22 ships this natively.
  const nodeReadable = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

  try {
    await pipeline(nodeReadable, progressTap);
  } catch (err) {
    fileStream.destroy();
    throw err;
  }
}

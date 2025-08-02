import fs from "node:fs/promises";
import path from "node:path";
import * as mime from "mime-types";
import { ScraperError } from "../../utils/errors";
import type { ContentFetcher, FetchOptions, RawContent } from "./types";

/**
 * Fetches content from local file system.
 */
export class FileFetcher implements ContentFetcher {
  canFetch(source: string): boolean {
    return source.startsWith("file://");
  }

  /**
   * Fetches the content of a file given a file:// URL, decoding percent-encoded paths as needed.
   * Only HTML and Markdown files are processed.
   */
  async fetch(source: string, _options?: FetchOptions): Promise<RawContent> {
    // Always decode the file path from file:// URL
    const rawPath = source.replace("file://", "");
    const filePath = decodeURIComponent(rawPath);

    try {
      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = mime.lookup(ext) || "application/octet-stream";
      return {
        content,
        mimeType,
        source,
        // Don't assume charset for text files - let the pipeline detect it
      };
    } catch (error: unknown) {
      throw new ScraperError(
        `Failed to read file ${filePath}: ${
          (error as { message?: string }).message ?? "Unknown error"
        }`,
        false,
        error instanceof Error ? error : undefined,
      );
    }
  }
}

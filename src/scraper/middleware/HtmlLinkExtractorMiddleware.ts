import { logger } from "../../utils/logger";
import type { ContentProcessorMiddleware, MiddlewareContext } from "./types";

/**
 * Middleware to extract links (href attributes from <a> tags) from HTML content using Cheerio.
 * It expects the Cheerio API object to be available in `context.dom`.
 * This should run *after* parsing but *before* conversion to Markdown.
 */
export class HtmlLinkExtractorMiddleware implements ContentProcessorMiddleware {
  /**
   * Processes the context to extract links from the sanitized HTML body.
   * @param context The current middleware context.
   * @param next Function to call the next middleware.
   */
  async process(context: MiddlewareContext, next: () => Promise<void>): Promise<void> {
    // Check if we have a Cheerio object from a previous step
    const $ = context.dom;
    if (!$) {
      logger.warn(
        `⏭️ Skipping ${this.constructor.name}: context.dom is missing. Ensure HtmlCheerioParserMiddleware runs before this.`,
      );
      await next();
      return;
    }

    try {
      const linkElements = $("a[href]");
      logger.debug(`Found ${linkElements.length} potential links in ${context.source}`);

      const extractedLinks: string[] = [];
      linkElements.each((_index, element) => {
        const href = $(element).attr("href");
        if (href && href.trim() !== "") {
          try {
            const urlObj = new URL(href, context.source);
            if (!["http:", "https:", "file:"].includes(urlObj.protocol)) {
              logger.debug(`Ignoring link with invalid protocol: ${href}`);
              return;
            }
            extractedLinks.push(urlObj.href);
          } catch (_e) {
            logger.debug(`Ignoring invalid URL syntax: ${href}`);
          }
        }
      });

      context.links = [...new Set(extractedLinks)];
      logger.debug(
        `Extracted ${context.links.length} unique, valid links from ${context.source}`,
      );
    } catch (error) {
      logger.error(`❌ Error extracting links from ${context.source}: ${error}`);
      context.errors.push(
        new Error(
          `Failed to extract links from HTML: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    await next();
  }
}

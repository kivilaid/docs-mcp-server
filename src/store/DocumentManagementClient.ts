/**
 * tRPC client for the document management API.
 * Implements IDocumentManagement and delegates to /api data router.
 */
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { ScraperOptions } from "../scraper/types";
import { logger } from "../utils/logger";
import type { IDocumentManagement } from "./trpc/interfaces";
import type { DataRouter } from "./trpc/router";
import type {
  DbVersion,
  DbVersionWithLibrary,
  FindVersionResult,
  LibraryVersionDetails,
  StoreSearchResult,
  VersionScraperOptions,
  VersionStatus,
} from "./types";

export class DocumentManagementClient implements IDocumentManagement {
  private readonly baseUrl: string;
  private readonly client: ReturnType<typeof createTRPCProxyClient<DataRouter>>;

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, "");
    this.client = createTRPCProxyClient<DataRouter>({
      links: [httpBatchLink({ url: this.baseUrl })],
    });
    logger.debug(`DocumentManagementClient (tRPC) created for: ${this.baseUrl}`);
  }

  async initialize(): Promise<void> {
    // Connectivity check
    await (
      this.client as unknown as { ping: { query: () => Promise<unknown> } }
    ).ping.query();
  }

  async shutdown(): Promise<void> {
    // no-op for HTTP client
  }

  async listLibraries(): Promise<
    Array<{ library: string; versions: LibraryVersionDetails[] }>
  > {
    return this.client.listLibraries.query();
  }

  async validateLibraryExists(library: string): Promise<void> {
    await this.client.validateLibraryExists.mutate({ library });
  }

  async findBestVersion(
    library: string,
    targetVersion?: string,
  ): Promise<FindVersionResult> {
    return this.client.findBestVersion.query({ library, targetVersion });
  }

  async searchStore(
    library: string,
    version: string | null | undefined,
    query: string,
    limit?: number,
  ): Promise<StoreSearchResult[]> {
    return this.client.search.query({ library, version: version ?? null, query, limit });
  }

  async removeAllDocuments(library: string, version?: string | null): Promise<void> {
    await this.client.removeAllDocuments.mutate({ library, version: version ?? null });
  }

  async getActiveVersions(): Promise<DbVersionWithLibrary[]> {
    return this.client.getActiveVersions.query();
  }

  async getRunningVersions(): Promise<DbVersionWithLibrary[]> {
    return this.client.getRunningVersions.query();
  }

  async getVersionsByStatus(statuses: VersionStatus[]): Promise<DbVersionWithLibrary[]> {
    return this.client.getVersionsByStatus.query({
      statuses: statuses as unknown as string[],
    });
  }

  async findVersionsBySourceUrl(url: string): Promise<DbVersionWithLibrary[]> {
    return this.client.findVersionsBySourceUrl.query({ url });
  }

  async getVersionScraperOptions(
    versionId: number,
  ): Promise<VersionScraperOptions | null> {
    return this.client.getVersionScraperOptions.query({ versionId });
  }

  async getVersionWithStoredOptions(versionId: number): Promise<DbVersion | null> {
    return this.client.getVersionWithStoredOptions.query({ versionId });
  }

  async updateVersionStatus(
    versionId: number,
    status: VersionStatus,
    errorMessage?: string,
  ): Promise<void> {
    await this.client.updateVersionStatus.mutate({ versionId, status, errorMessage });
  }

  async updateVersionProgress(
    versionId: number,
    pages: number,
    maxPages: number,
  ): Promise<void> {
    await this.client.updateVersionProgress.mutate({ versionId, pages, maxPages });
  }

  async storeScraperOptions(versionId: number, options: ScraperOptions): Promise<void> {
    await this.client.storeScraperOptions.mutate({ versionId, options });
  }
}

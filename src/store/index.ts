import type { IDocumentManagement } from "./trpc/interfaces";

export * from "./DocumentManagementClient";
export * from "./DocumentManagementService";
export * from "./DocumentStore";
export * from "./errors";
export * from "./trpc/interfaces";

/** Factory to create a document management implementation */
export async function createDocumentManagement(options: { serverUrl?: string } = {}) {
  if (options.serverUrl) {
    const { DocumentManagementClient } = await import("./DocumentManagementClient");
    const client = new DocumentManagementClient(options.serverUrl);
    await client.initialize();
    return client as IDocumentManagement;
  }
  const service = new (
    await import("./DocumentManagementService")
  ).DocumentManagementService();
  await service.initialize();
  return service as IDocumentManagement;
}

/**
 * Creates and initializes a local DocumentManagementService instance.
 * Use this only when constructing an in-process PipelineManager (worker path).
 */
export async function createLocalDocumentManagement() {
  const service = new (
    await import("./DocumentManagementService")
  ).DocumentManagementService();
  await service.initialize();
  return service;
}

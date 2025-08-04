/**
 * App module exports for the central application server architecture.
 */

/**
 * Application server module exports.
 * Provides AppServer and configuration types, plus convenience functions for CLI integration.
 */

export { AppServer } from "./AppServer";
export type { AppServerConfig } from "./AppServerConfig";

import type { IPipeline } from "../pipeline/interfaces";
import type { DocumentManagementService } from "../store/DocumentManagementService";
import { AppServer } from "./AppServer";
import type { AppServerConfig } from "./AppServerConfig";

/**
 * Start an AppServer with the given configuration.
 * Convenience function for CLI integration.
 */
export async function startAppServer(
  docService: DocumentManagementService,
  pipeline: IPipeline,
  config: AppServerConfig,
): Promise<AppServer> {
  const appServer = new AppServer(docService, pipeline, config);
  await appServer.start();
  return appServer;
}

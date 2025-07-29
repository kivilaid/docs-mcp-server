import type { PipelineManager } from "../pipeline/PipelineManager";
import { FileFetcher, HttpFetcher } from "../scraper/fetcher";
import type { DocumentManagementService } from "../store/DocumentManagementService";
import {
  CancelJobTool,
  FetchUrlTool,
  FindVersionTool,
  GetJobInfoTool,
  ListJobsTool,
  ListLibrariesTool,
  RemoveTool,
  ScrapeTool,
  SearchTool,
} from "../tools";

/**
 * Interface for the shared tool instances.
 */
export interface McpServerTools {
  listLibraries: ListLibrariesTool;
  findVersion: FindVersionTool;
  scrape: ScrapeTool;
  search: SearchTool;
  listJobs: ListJobsTool;
  getJobInfo: GetJobInfoTool;
  cancelJob: CancelJobTool;
  remove: RemoveTool;
  fetchUrl: FetchUrlTool;
}

/**
 * Initializes and returns the shared tool instances.
 * This should be called after initializeServices has completed.
 * @param docService The initialized DocumentManagementService instance.
 * @param pipelineManager The initialized PipelineManager instance.
 * @returns An object containing all instantiated tool instances.
 */
export async function initializeTools(
  docService: DocumentManagementService,
  pipelineManager: PipelineManager,
): Promise<McpServerTools> {
  const tools: McpServerTools = {
    listLibraries: new ListLibrariesTool(docService),
    findVersion: new FindVersionTool(docService),
    scrape: new ScrapeTool(docService, pipelineManager),
    search: new SearchTool(docService),
    listJobs: new ListJobsTool(pipelineManager),
    getJobInfo: new GetJobInfoTool(pipelineManager),
    cancelJob: new CancelJobTool(pipelineManager),
    // clearCompletedJobs: new ClearCompletedJobsTool(pipelineManager),
    remove: new RemoveTool(docService, pipelineManager),
    fetchUrl: new FetchUrlTool(new HttpFetcher(), new FileFetcher()),
  };

  return tools;
}

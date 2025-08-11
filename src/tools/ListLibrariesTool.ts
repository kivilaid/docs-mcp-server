import type { IDocumentManagement } from "../store/trpc/interfaces";
import type { LibraryVersionDetails } from "../store/types";

// Define the structure for the tool's output, using the detailed version info
export interface LibraryInfo {
  name: string;
  versions: LibraryVersionDetails[]; // Use the detailed interface
}

export interface ListLibrariesResult {
  libraries: LibraryInfo[];
}

/**
 * Tool for listing all available libraries and their indexed versions in the store.
 */
export class ListLibrariesTool {
  private docService: IDocumentManagement;

  constructor(docService: IDocumentManagement) {
    this.docService = docService;
  }

  async execute(_options?: Record<string, never>): Promise<ListLibrariesResult> {
    // docService.listLibraries() now returns the detailed structure directly
    const rawLibraries = await this.docService.listLibraries();

    // The structure returned by listLibraries already matches LibraryInfo[]
    // No complex mapping is needed here anymore, just ensure the names match
    const libraries: LibraryInfo[] = rawLibraries.map(({ library, versions }) => ({
      name: library,
      versions: versions, // Directly assign the detailed versions array
    }));

    return { libraries };
  }
}

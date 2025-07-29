import type { LibraryInfo } from "../../tools/ListLibrariesTool";
import VersionDetailsRow from "./VersionDetailsRow"; // Adjusted import path

/**
 * Props for the LibraryItem component.
 */
interface LibraryItemProps {
  library: LibraryInfo;
}

/**
 * Renders a card for a single library, listing its versions with details.
 * Uses VersionDetailsRow to display each version.
 * @param props - Component props including the library information.
 */
const LibraryItem = ({ library }: LibraryItemProps) => (
  // Use Flowbite Card structure with updated padding and border, and white background
  <div class="block px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-300 dark:border-gray-600">
    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">
      <a
        href={`/libraries/${encodeURIComponent(library.name)}`}
        class="hover:underline"
      >
        <span safe>{library.name}</span>
      </a>
    </h3>
    {/* Container for version rows */}
    <div class="mt-1">
      {library.versions.length > 0 ? (
        library.versions.map((version) => (
          <VersionDetailsRow libraryName={library.name} version={version} />
        ))
      ) : (
        // Display message if no versions are indexed
        <p class="text-sm text-gray-500 dark:text-gray-400 italic">
          No versions indexed.
        </p>
      )}
    </div>
  </div>
);

export default LibraryItem;

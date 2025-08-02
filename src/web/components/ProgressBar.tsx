/**
 * ProgressBar component displays indexing progress.
 * Shows pages processed out of total pages with visual progress bar.
 */

interface ProgressBarProps {
  progress: {
    pages: number;
    maxPages: number;
  };
  showText?: boolean;
}

const ProgressBar = ({ progress, showText = true }: ProgressBarProps) => {
  const percentage =
    progress.maxPages > 0
      ? Math.round((progress.pages / progress.maxPages) * 100)
      : 0;

  return (
    <div class="w-full">
      {showText && (
        <div class="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
          <span>Progress</span>
          <span>
            {progress.pages}/{progress.maxPages} pages ({percentage}%)
          </span>
        </div>
      )}
      <div class="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
        <div
          class="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={`width: ${percentage}%`}
        ></div>
      </div>
    </div>
  );
};

export default ProgressBar;

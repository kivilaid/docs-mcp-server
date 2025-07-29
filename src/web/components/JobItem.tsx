import type { JobInfo } from "../../tools/GetJobInfoTool";
import { PipelineJobStatus } from "../../pipeline/types";
import VersionBadge from "./VersionBadge"; // Adjusted import path
import LoadingSpinner from "./LoadingSpinner";

/**
 * Props for the JobItem component.
 */
interface JobItemProps {
  job: JobInfo;
}

/**
 * Renders a single job item with its details and status.
 * Includes a cancel button with loading spinner for QUEUED/RUNNING jobs.
 * @param props - Component props including the job information.
 */
const JobItem = ({ job }: JobItemProps) => (
  // Use Flowbite Card structure with reduced padding and added border
  <div class="block p-2 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-gray-900 dark:text-white">
          <span safe>{job.library}</span>{" "}
          {/* Display version as badge if exists */}
          <VersionBadge version={job.version} />
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Indexed: <span safe>{new Date(job.createdAt).toLocaleString()}</span>
        </p>
      </div>
      <div class="flex flex-col items-end gap-1">
        {/* Status badge with inline stop button for QUEUED/RUNNING jobs */}
        <div class="flex items-center gap-2">
          <span
            class={`px-1.5 py-0.5 text-xs font-medium rounded ${
              job.status === PipelineJobStatus.COMPLETED
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                : job.error
                  ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
            }`}
          >
            {job.status}
          </span>
          {/* Stop button for QUEUED/RUNNING jobs */}
          {(job.status === PipelineJobStatus.QUEUED ||
            job.status === PipelineJobStatus.RUNNING) && (
            <button
              type="button"
              class="font-medium rounded-lg text-xs p-1 text-center inline-flex items-center transition-colors duration-150 ease-in-out border border-gray-300 bg-white text-red-600 hover:bg-red-50 focus:ring-4 focus:outline-none focus:ring-red-100 dark:border-gray-600 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-gray-700 dark:focus:ring-red-900"
              title="Stop this job"
              x-data="{}"
              x-on:click={`
                if ($store.confirmingAction.type === 'job-cancel' && $store.confirmingAction.id === '${job.id}') {
                  $store.confirmingAction.isStopping = true;
                  fetch('/api/jobs/' + '${job.id}' + '/cancel', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json' },
                  })
                    .then(r => r.json())
                    .then(() => {
                      $store.confirmingAction.type = null;
                      $store.confirmingAction.id = null;
                      $store.confirmingAction.isStopping = false;
                      if ($store.confirmingAction.timeoutId) { clearTimeout($store.confirmingAction.timeoutId); $store.confirmingAction.timeoutId = null; }
                      document.dispatchEvent(new CustomEvent('job-list-refresh'));
                    })
                    .catch(() => { $store.confirmingAction.isStopping = false; });
                } else {
                  if ($store.confirmingAction.timeoutId) { clearTimeout($store.confirmingAction.timeoutId); $store.confirmingAction.timeoutId = null; }
                  $store.confirmingAction.type = 'job-cancel';
                  $store.confirmingAction.id = '${job.id}';
                  $store.confirmingAction.isStopping = false;
                  $store.confirmingAction.timeoutId = setTimeout(() => {
                    $store.confirmingAction.type = null;
                    $store.confirmingAction.id = null;
                    $store.confirmingAction.isStopping = false;
                    $store.confirmingAction.timeoutId = null;
                  }, 3000);
                }
              `}
              x-bind:disabled={`$store.confirmingAction.type === 'job-cancel' && $store.confirmingAction.id === '${job.id}' && $store.confirmingAction.isStopping`}
            >
              <span
                x-show={`$store.confirmingAction.type !== 'job-cancel' || $store.confirmingAction.id !== '${job.id}' || $store.confirmingAction.isStopping`}
              >
                {/* Red Stop Icon */}
                <svg
                  class="w-4 h-4"
                  aria-hidden="true"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <rect x="5" y="5" width="10" height="10" rx="2" />
                </svg>
                <span class="sr-only">Stop job</span>
              </span>
              <span
                x-show={`$store.confirmingAction.type === 'job-cancel' && $store.confirmingAction.id === '${job.id}' && !$store.confirmingAction.isStopping`}
                class="px-2"
              >
                Cancel?
              </span>
              <span
                x-show={`$store.confirmingAction.type === 'job-cancel' && $store.confirmingAction.id === '${job.id}' && $store.confirmingAction.isStopping`}
              >
                <LoadingSpinner />
                <span class="sr-only">Stopping...</span>
              </span>
            </button>
          )}
        </div>
        {job.error && (
          // Keep the error badge for clarity if an error occurred
          <span class="bg-red-100 text-red-800 text-xs font-medium px-1.5 py-0.5 rounded dark:bg-red-900 dark:text-red-300">
            Error
          </span>
        )}
      </div>
    </div>
  </div>
);

export default JobItem;

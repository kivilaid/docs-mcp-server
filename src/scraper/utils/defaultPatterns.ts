/**
 * Default exclusion patterns for documentation scraping.
 * These patterns are always applied unless user explicitly provides their own exclude patterns.
 * Patterns use glob/regex syntax supported by the pattern matcher.
 */

/**
 * Default file exclusion patterns - files commonly found in documentation that should be excluded.
 * These patterns match both exact filenames and files anywhere in the path.
 */
export const DEFAULT_FILE_EXCLUSIONS = [
  // Common documentation metadata files (case variations)
  "CHANGELOG.md",
  "CHANGELOG.mdx",
  "changelog.md",
  "changelog.mdx",
  "LICENSE",
  "LICENSE.md",
  "license.md",
  "CODE_OF_CONDUCT.md",
  "code_of_conduct.md",
  // Also match these files anywhere in path structure
  "**/CHANGELOG.md",
  "**/CHANGELOG.mdx",
  "**/changelog.md",
  "**/changelog.mdx",
  "**/LICENSE",
  "**/LICENSE.md",
  "**/license.md",
  "**/CODE_OF_CONDUCT.md",
  "**/code_of_conduct.md",
];

/**
 * Default folder/path exclusion patterns - directories commonly found in documentation that should be excluded.
 */
export const DEFAULT_FOLDER_EXCLUSIONS = [
  // Archive and deprecated content (match anywhere in path)
  "**/archive/**",
  "**/archived/**",
  "**/old/**",
  "**/deprecated/**",
  "**/legacy/**",
  "**/previous/**",
  "**/outdated/**",
  "**/superseded/**",
  // Also match top-level folders
  "archive/**",
  "archived/**",
  "old/**",
  "deprecated/**",
  "legacy/**",
  "previous/**",
  "outdated/**",
  "superseded/**",
  // Specific paths
  "docs/old/**",

  // Internationalization folders - non-English locales
  "**/i18n/zh*/**",
  "**/i18n/es*/**",
  "**/i18n/fr*/**",
  "**/i18n/de*/**",
  "**/i18n/ja*/**",
  "**/i18n/ko*/**",
  "**/i18n/ru*/**",
  "**/i18n/pt*/**",
  "**/i18n/it*/**",
  "**/i18n/ar*/**",
  "**/i18n/hi*/**",
  "**/i18n/tr*/**",
  "**/i18n/nl*/**",
  "**/i18n/pl*/**",
  "**/i18n/sv*/**",
  "**/i18n/vi*/**",
  "**/i18n/th*/**",

  // Common locale folder patterns
  "**/zh-cn/**",
  "**/zh-tw/**",
  "**/zh-hk/**",
  "**/zh-mo/**",
  "**/zh-sg/**",
  // Top-level locale folders
  "zh-cn/**",
  "zh-tw/**",
  "zh-hk/**",
  "zh-mo/**",
  "zh-sg/**",
];

/**
 * Combined default exclusion patterns (files + folders).
 * These are applied when no user-provided exclude patterns are specified.
 */
export const DEFAULT_EXCLUSION_PATTERNS = [
  ...DEFAULT_FILE_EXCLUSIONS,
  ...DEFAULT_FOLDER_EXCLUSIONS,
];

/**
 * Get effective exclusion patterns by merging defaults with user patterns.
 * If user provides patterns, use only theirs (allowing override).
 * If user provides no patterns, use defaults.
 */
export function getEffectiveExclusionPatterns(userPatterns?: string[]): string[] {
  // If user explicitly provides patterns (even empty array), respect their choice
  if (userPatterns !== undefined) {
    return userPatterns;
  }

  // Otherwise, use default patterns
  return DEFAULT_EXCLUSION_PATTERNS;
}

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXCLUSION_PATTERNS,
  DEFAULT_FILE_EXCLUSIONS,
  DEFAULT_FOLDER_EXCLUSIONS,
  getEffectiveExclusionPatterns,
} from "./defaultPatterns";

describe("defaultPatterns", () => {
  describe("DEFAULT_FILE_EXCLUSIONS", () => {
    it("should include common documentation files", () => {
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("CHANGELOG.md");
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("CHANGELOG.mdx");
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("changelog.md");
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("changelog.mdx");
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("LICENSE");
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("LICENSE.md");
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("license.md");
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("CODE_OF_CONDUCT.md");
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("code_of_conduct.md");
    });

    it("should include path-aware patterns for files", () => {
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("**/CHANGELOG.md");
      expect(DEFAULT_FILE_EXCLUSIONS).toContain("**/LICENSE");
    });

    it("should have both basename and path patterns", () => {
      expect(DEFAULT_FILE_EXCLUSIONS.length).toBeGreaterThan(10);
    });
  });

  describe("DEFAULT_FOLDER_EXCLUSIONS", () => {
    it("should include archive and deprecated folder patterns", () => {
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/archive/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/archived/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/old/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("docs/old/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/deprecated/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/legacy/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/previous/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/outdated/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/superseded/**");
    });

    it("should include i18n folder patterns", () => {
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/zh*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/es*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/fr*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/de*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/ja*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/ko*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/ru*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/pt*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/it*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/ar*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/hi*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/tr*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/nl*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/pl*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/sv*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/vi*/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/i18n/th*/**");
    });

    it("should include locale folder patterns", () => {
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/zh-cn/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/zh-tw/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/zh-hk/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/zh-mo/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("**/zh-sg/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("zh-cn/**");
      expect(DEFAULT_FOLDER_EXCLUSIONS).toContain("zh-tw/**");
    });

    it("should have comprehensive folder patterns", () => {
      expect(DEFAULT_FOLDER_EXCLUSIONS.length).toBeGreaterThan(30);
    });
  });

  describe("DEFAULT_EXCLUSION_PATTERNS", () => {
    it("should combine file and folder patterns", () => {
      expect(DEFAULT_EXCLUSION_PATTERNS).toHaveLength(
        DEFAULT_FILE_EXCLUSIONS.length + DEFAULT_FOLDER_EXCLUSIONS.length,
      );

      // Check that all file patterns are included
      for (const pattern of DEFAULT_FILE_EXCLUSIONS) {
        expect(DEFAULT_EXCLUSION_PATTERNS).toContain(pattern);
      }

      // Check that all folder patterns are included
      for (const pattern of DEFAULT_FOLDER_EXCLUSIONS) {
        expect(DEFAULT_EXCLUSION_PATTERNS).toContain(pattern);
      }
    });
  });

  describe("getEffectiveExclusionPatterns", () => {
    it("should return default patterns when no user patterns provided", () => {
      const result = getEffectiveExclusionPatterns(undefined);
      expect(result).toEqual(DEFAULT_EXCLUSION_PATTERNS);
    });

    it("should return user patterns when provided", () => {
      const userPatterns = ["custom/*", "user-specific.md"];
      const result = getEffectiveExclusionPatterns(userPatterns);
      expect(result).toEqual(userPatterns);
      expect(result).not.toEqual(DEFAULT_EXCLUSION_PATTERNS);
    });

    it("should return empty array if user explicitly provides empty array", () => {
      const result = getEffectiveExclusionPatterns([]);
      expect(result).toEqual([]);
      expect(result).not.toEqual(DEFAULT_EXCLUSION_PATTERNS);
    });

    it("should allow user to override with single pattern", () => {
      const userPatterns = ["only-this/*"];
      const result = getEffectiveExclusionPatterns(userPatterns);
      expect(result).toEqual(["only-this/*"]);
    });
  });
});

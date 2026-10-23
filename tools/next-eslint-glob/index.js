import { statSync } from "node:fs";
import { resolve } from "node:path";
import { globSync as findDirectories, isDynamicPattern } from "tinyglobby";

export function globSync(patterns, options) {
  // Preserve fast-glob's exact directory matching and trailing-slash support.
  const normalized = (Array.isArray(patterns) ? patterns : [patterns])
    .map((pattern) => pattern.length > 1 ? pattern.replace(/\/+$/, "") : pattern);
  if (normalized.length === 1 && !isDynamicPattern(normalized[0])) {
    const directory = resolve(options?.cwd ?? process.cwd(), normalized[0]);
    return statSync(directory, { throwIfNoEntry: false })?.isDirectory()
      ? [options?.absolute ? directory : normalized[0]]
      : [];
  }
  return findDirectories(normalized, { ...options, expandDirectories: false });
}

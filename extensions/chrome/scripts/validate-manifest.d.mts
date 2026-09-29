// Types for validate-manifest.mjs so tests/manifest.test.ts typechecks.
export declare const EXTENSION_ROOT: string
export declare function pngSize(file: string): { width: number; height: number } | null
export declare function validateManifest(dir: string, options?: { compiledFrom?: string; staticFrom?: string }): string[]
export declare function writeFixture(files: Record<string, string | { base64: string }>): string

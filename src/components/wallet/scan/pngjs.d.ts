// Test-only PNG decoder (fixtures for card-detect.test.ts); no bundled types.
declare module "pngjs" {
  export const PNG: {
    sync: { read(buf: Uint8Array): { width: number; height: number; data: Uint8Array } };
  };
}

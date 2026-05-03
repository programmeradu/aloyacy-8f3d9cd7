// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const sharedSrc = path.resolve(workspaceRoot, "src");
const sharedCore = path.resolve(workspaceRoot, "packages/core");

// Watch the web source tree and the shared `@aloya/core` package so Metro
// hot-reloads when shared code changes.
config.watchFolders = [sharedSrc, sharedCore];

// Resolve from both the mobile and root node_modules so workspace symlinks
// (including `@aloya/core`) are picked up exactly once.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Allow `@aloya/core/*` package-exports to resolve through Metro.
config.resolver.unstable_enablePackageExports = true;

module.exports = withNativeWind(config, { input: "./global.css" });

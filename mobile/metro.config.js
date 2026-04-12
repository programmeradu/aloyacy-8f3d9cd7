// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require("nativewind/metro");
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const sharedSrc = path.resolve(__dirname, '../src');
config.watchFolders = [sharedSrc];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules')
];

module.exports = withNativeWind(config, { input: "./global.css" });

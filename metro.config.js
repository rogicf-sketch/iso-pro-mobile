// @ts-check
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const sharedRoot = path.resolve(monorepoRoot, 'iso-pro-shared');

/** Permite `iso-pro-shared` via `file:../iso-pro-shared` ao empacotar o APK (Gradle / Metro). */
const config = getDefaultConfig(projectRoot);

config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), monorepoRoot]));

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
    'iso-pro-shared': sharedRoot,
  },
};

module.exports = config;

// @ts-check
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
/** Pacote vendored (EAS não tem ../iso-pro-shared). */
const sharedRoot = path.resolve(projectRoot, 'vendor/iso-pro-shared');

const config = getDefaultConfig(projectRoot);

config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), sharedRoot]));

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver.extraNodeModules,
    'iso-pro-shared': sharedRoot,
  },
};

module.exports = config;

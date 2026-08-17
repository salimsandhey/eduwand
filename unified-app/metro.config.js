const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and monorepo root directories
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo - appended to Expo's own defaults,
// not replacing them (a full overwrite here is what "expo doctor" flags as
// "watchFolders does not contain all entries from Expo's defaults", which
// EAS Build treats as a hard failure before it ever compiles anything).
config.watchFolders = [...config.watchFolders, monorepoRoot];

// 2. Let Metro know where to resolve packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;

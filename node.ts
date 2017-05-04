import {BannerPlugin, Configuration, Entry} from 'webpack'
import * as nodeExternals from 'webpack-node-externals'

interface Options {
  useDotEnv: boolean
}

// Modules to include in Node builds
const nodeModules = [
  'dotenv/config',
]

/**
 * Add Node build settings to Webpack configuration
 * @param config Configuration to modify
 * @return Updated configuration
 */
export function addNode(
  {entry, plugins = [], ...config}: Configuration,
  {useDotEnv}: Options,
): Configuration {
  // Exclude node_modules when building for non-web
  return {
    ...config,
    entry: useDotEnv ? addNodeModules(entry as Entry) : entry,
    externals: [nodeExternals()],
    plugins: [
      ...plugins,
      new BannerPlugin({
        banner: '#!/usr/bin/env node',
        entryOnly: true,
        raw: true,
      }),
    ],
  }
}

/**
 * Add node modules to each entry
 * @param entry Entry information
 * @return Updated entries
 */
function addNodeModules(entry: Entry) {
  // Add node modules to each entry
  return Object.keys(entry)
    .filter(key => Array.isArray(entry[key]))
    .reduce((previous, key) => ({
      ...previous,
      [key]: [...nodeModules, ...entry[key]],
    }), {} as Entry)
}

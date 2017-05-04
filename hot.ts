import {
  Configuration,
  Entry,
  HotModuleReplacementPlugin,
  NoEmitOnErrorsPlugin,
} from 'webpack'

// Modules requires for hot reloading in development
const hotModules = [
  'webpack-hot-middleware/client',
]

/**
 * Add HMR settings to Webpack configuration
 * @param config Configuration to modify
 * @return Updated configuration
 */
export function addHot({
  entry,
  plugins = [],
  ...config,
}: Configuration): Configuration {
  return {
    ...config,
    entry: addHotModules(entry as Entry),
    plugins: [
      ...plugins,
      new HotModuleReplacementPlugin(),
      new NoEmitOnErrorsPlugin(),
    ],
  }
}

/**
 * Add hot modules to each entry
 * @param entry Entry information
 * @return Updated entries
 */
function addHotModules(entry: Entry) {
  return Object.keys(entry)
    .filter(key => Array.isArray(entry[key]))
    .reduce((previous, key) => ({
      ...previous,
      [key]: [...hotModules, ...entry[key]],
    }), {} as Entry)
}

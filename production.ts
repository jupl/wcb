import {Configuration, LoaderOptionsPlugin} from 'webpack'
import * as BabiliPluginRaw from 'babili-webpack-plugin'

// tslint:disable-next-line:no-any
const BabiliPlugin = BabiliPluginRaw as any

/**
 * Add production build settings to Webpack configuration
 * @param config Configuration to modify
 * @return Updated configuration
 */
export function addProduction({
  plugins = [],
  ...config,
}: Configuration): Configuration {
  return {
    ...config,
    plugins: [
      ...plugins,
      new LoaderOptionsPlugin({minimize: true, debug: false}),
      new BabiliPlugin(),
    ],
  }
}

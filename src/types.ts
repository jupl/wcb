import {LoaderConfig} from 'awesome-typescript-loader/dist/interfaces'
import {Options as HtmlPluginOptions} from 'html-webpack-plugin'
import Webpack from 'webpack'

type Devtool = Webpack.Configuration['devtool']
type Target = Webpack.Configuration['target']

/** Webpack entries */
export interface Entry {
  [name: string]: string[]
}

/** Webpack output */
export interface Output extends Webpack.Output {
  path: string
  filename: string
}

/** Webpack module resolution */
export interface Resolve extends Webpack.Resolve {
  extensions: string[]
  plugins: Webpack.ResolvePlugin[]
}

/** Webpack configuration specific for this application */
export interface Configuration extends Webpack.Configuration {
  entry: Entry
  module: Webpack.Module
  optimization: Webpack.Options.Optimization
  output: Output
  plugins: Webpack.Plugin[]
  resolve: Resolve
}

/** Webpack loader for CSS family files */
export interface CSSLoader extends Webpack.RuleSetRule {
  use: Webpack.Loader[]
}

/** Options for webpack build */
export interface Options {
  assets?: string | boolean
  assetsIgnore?: string[]
  chunkFilename?: string
  common?: string | boolean
  devServer?: boolean
  cssLoaders?: CSSLoader[]
  destination?: string
  environment?: 'development' | 'production'
  filename?: string
  hotReload?: boolean
  html?: boolean | string | HtmlPluginOptions
  log?: string | boolean
  pattern?: string[]
  paths?: boolean
  source?: string
  sourceMaps?: Devtool
  split?: boolean
  target?: Target
  typescript?: LoaderConfig | boolean
  webpack?: Webpack.Configuration
}

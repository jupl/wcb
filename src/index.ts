import {LoaderConfig} from 'awesome-typescript-loader/dist/interfaces'
import {F_OK} from 'constants'
import CopyPlugin from 'copy-webpack-plugin'
import {accessSync} from 'fs'
import {find} from 'globule'
import {flow} from 'lodash'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import path from 'path'
import Webpack from 'webpack'
import nodeExternals from 'webpack-node-externals'

const ELECTRON_RENDERER = 'electron-renderer'
const IGNORE_GLOBS = [
  '!**/coverage/**',
  '!**/node_modules/**',
  '!**/*.d.ts',
  '!**/__tests__/**',
  '!**/{,*.}{test,spec}.*',
]
const INVALID_ENVIRONMENT = '_-_|_-_'
const NON_NODE_TARGETS: Target[] = ['web', 'webworker']
const TRUTHY = /^(?:y|yes|true|1)$/i

type Target = Webpack.Configuration['target']

/** Webpack entries */
export interface Entry {
  [name: string]: string[]
}

/** Webpack output */
export interface Output extends Webpack.Output {
  path: string
  filename: string
  publicPath: string
}

/** Webpack module resolution */
export interface Resolve extends Webpack.Resolve {
  extensions: string[]
}

/** Webpack configuration specific for this application */
export interface Configuration extends Webpack.Configuration {
  entry: Entry
  module: Webpack.Module
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
  assets?: string | false
  assetsIgnore?: string[]
  atlOptions?: LoaderConfig
  common?: string | boolean
  devServer?: boolean
  cssLoaders?: CSSLoader[]
  destination?: string
  environment?: string
  filename?: string
  hotReload?: boolean
  pattern?: string[]
  source?: string
  sourceMaps?: boolean
  target?: Target
  log?(message: string): void
}

/**
 * Build Webpack configuration
 * @param options Options
 * @return Webpack configuration
 */
export function createConfiguration(options: Options = {}): Configuration {
  const internalOptions = optionsWithDefaults(options)
  return flow([
    addDevServer(internalOptions),
    addSourceMaps(internalOptions),
    addProduction(internalOptions),
    addAssets(internalOptions),
    addNode(internalOptions),
    addCommonChunk(internalOptions),
    addCssLoaders(internalOptions),
    addHotReload(internalOptions),
  ])(createBase(internalOptions))
}

/**
 * Add plugins to Webpack configuration
 * @param configuration Configuration to update
 * @param plugins Plugins to add
 * @return Updated configuration
 */
export function addPlugins(
  configuration: Configuration,
  plugins: Webpack.Plugin[],
): Configuration {
  return {...configuration, plugins: [...configuration.plugins, ...plugins]}
}

/**
 * Add rules to Webpack configuration
 * @param configuration Configuration to update
 * @param rules Rules to add
 * @return Updated configuration
 */
export function addRules(
  configuration: Configuration,
  rules: Webpack.RuleSetRule[],
): Configuration {
  return {
    ...configuration,
    module: {
      ...configuration.module,
      rules: [...configuration.module.rules, ...rules],
    },
  }
}

/**
 * Add modules for each entry to Webpack configuration
 * @param configuration Configuration to update
 * @param modules Modules to add
 * @return Updated configuration
 */
export function addToEntries(
  configuration: Configuration,
  modules: string[],
): Configuration {
  return {
    ...configuration,
    entry: Object.keys(configuration.entry)
      .filter(key => Array.isArray(configuration.entry[key]))
      .reduce<Entry>((previous, key) => ({
        ...previous,
        [key]: [...modules, ...configuration.entry[key]],
      }), {}),
  }
}

type InternalOptions = { [P in keyof Options]-?: Options[P] }

function createBase({
  atlOptions,
  destination,
  environment,
  filename,
  hotReload,
  log,
  pattern,
  source,
  target,
}: InternalOptions): Configuration {
  log('--- wcb: making base configuration')
  return {
    target,
    context: path.resolve(source),
    entry: find([...pattern, ...IGNORE_GLOBS], {srcBase: source})
      .map(file => ({
        base: path.basename(file, path.extname(file)),
        dir: path.dirname(file),
        file: `.${path.sep}${file}`,
      }))
      .reduce((obj, {base, dir, file}) => ({
        ...obj, [path.join(dir, base)]: [file],
      }), {}),
    mode: 'none',
    module: {
      rules: [
        {
          exclude: /node_modules/,
          test: /\.[jt]sx?$/,
          use: [
            {
              loader: 'awesome-typescript-loader',
              options: {
                cacheDirectory: 'node_modules/.awcache',
                forceIsolatedModules: true,
                transpileOnly: true,
                useCache: hotReload,
                ...atlOptions,
              },
            },
          ],
        },
      ],
    },
    output: {
      filename: `${filename}.js`,
      path: path.resolve(destination),
      publicPath: '/',
    },
    plugins: [
      new Webpack.DefinePlugin({
        'process.env.IS_CLIENT': JSON.stringify(String(!isNodeTarget(target))),
        'process.env.NODE_ENV': environment !== INVALID_ENVIRONMENT
          ? JSON.stringify(environment)
          : 'undefined',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
    ],
    resolve: {extensions: ['.js', '.json', '.jsx', '.ts', '.tsx']},
  }
}

function addAssets({assets, assetsIgnore: ignore, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(typeof assets !== 'string') { return configuration }
    const from = path.resolve(assets)
    try {
      accessSync(from, F_OK)
    }
    catch(e) {
      return configuration
    }
    log('--- wcb: adding assets configuration')
    return addPlugins(configuration, [new CopyPlugin([{from, ignore}])])
  }
}

function addCommonChunk({common}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(common === false) { return configuration }
    const name = common === true ? 'common' : common
    return {
      ...configuration,
      optimization: {
        ...configuration.optimization,
        splitChunks: {
          cacheGroups: {common: {chunks: 'initial', minChunks: 2, name}},
        },
      },
    }
  }
}

function addCssLoaders({
  cssLoaders,
  filename,
  hotReload,
  target,
}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(cssLoaders.length === 0) { return configuration }
    if(hotReload || isNodeTarget(target)) {
      return addRules(configuration, cssLoaders.map(({use, ...rule}) => ({
        ...rule,
        use: ['style-loader', ...use],
      })))
    }
    return addRules(addPlugins(configuration, [
      new MiniCssExtractPlugin({filename: `${filename}.css`}),
    ]), cssLoaders.map(({use, ...rule}) => ({
      ...rule,
      use: [MiniCssExtractPlugin.loader, ...use],
    })))
  }
}

function addDevServer({devServer, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!devServer) { return configuration }
    log('--- wcb: adding webpack dev server')
    return {
      ...configuration,
      devServer: {stats: {all: false, builtAt: true, errors: true}},
    }
  }
}

function addSourceMaps({sourceMaps, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!sourceMaps) { return configuration }
    log('--- wcb: adding source maps')
    return {
      ...configuration,
      devtool: 'source-map',
      output: {
        ...configuration.output,
        devtoolModuleFilenameTemplate: fixPath,
      },
    }
  }
}

function addHotReload({devServer, hotReload, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!hotReload) { return configuration }
    log('--- wcb: adding hot modules configuration')
    const config = addPlugins({
      ...configuration,
      optimization: {...configuration.optimization, noEmitOnErrors: true},
    }, [new Webpack.HotModuleReplacementPlugin()])
    return devServer
      ? {...config, devServer: {...config.devServer, hot: true}}
      : addToEntries(config, ['webpack-hot-middleware/client'])
  }
}

function addNode({log, target}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!isNodeTarget(target, true)) { return configuration }
    log('--- wcb: adding node configuration')
    const config: Configuration = {
      ...configuration,
      node: {
        Buffer: false,
        __dirname: false,
        __filename: false,
        global: false,
        process: false,
        setImmediate: false,
      },
    }
    if(target === ELECTRON_RENDERER) { return config }
    return {...config, externals: [nodeExternals()]}
  }
}

function addProduction({cssLoaders, environment, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(environment !== 'production') { return configuration }
    log('--- wcb: adding production configuration')
    const BabelMinifyPlugin = require('babel-minify-webpack-plugin')
    let plugins: Webpack.Plugin[] = [
      new Webpack.LoaderOptionsPlugin({minimize: true, debug: false}),
      new BabelMinifyPlugin(),
    ]
    if(cssLoaders.length > 0) {
      const OptimizeCssPlugin = require('optimize-css-assets-webpack-plugin')
      plugins = [...plugins, new OptimizeCssPlugin()]
    }
    return addPlugins(configuration, plugins)
  }
}

function isNodeTarget(target: Target, rendererCounts = false) {
  const targets: Target[] = rendererCounts
    ? NON_NODE_TARGETS
    : [...NON_NODE_TARGETS, ELECTRON_RENDERER]
  return targets.indexOf(target) === -1
}

function optionsWithDefaults(options: Options): InternalOptions {
  const {
    assets = false,
    atlOptions = {},
    common = false,
    cssLoaders = [],
    destination = '',
    devServer = false,
    environment = process.env.NODE_ENV !== undefined
      ? String(process.env.NODE_ENV)
      : INVALID_ENVIRONMENT,
    filename = '[name]',
    log = () => undefined,
    pattern = ['**/*.{j,t}s{,x}'],
    source = '',
    target = 'web',
  } = options
  const {
    assetsIgnore = pattern,
    hotReload = !isNodeTarget(target) && TRUTHY.test(process.env.HOT_MODULES!),
    sourceMaps = environment !== 'production',
  } = options
  return {
    assets,
    assetsIgnore,
    atlOptions,
    common,
    cssLoaders,
    destination,
    devServer,
    environment,
    filename,
    hotReload,
    log,
    pattern,
    source,
    sourceMaps,
    target,
  }
}

function fixPath(i: Webpack.DevtoolModuleFilenameTemplateInfo) {
  const protocol = path.isAbsolute(i.absoluteResourcePath) ? 'file' : 'webpack'
  const resource = i.absoluteResourcePath.split(path.sep).join('/')
  return `${protocol}://${resource.startsWith('/') ? '' : '/'}${resource}`
}

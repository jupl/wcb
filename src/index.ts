import {LoaderConfig} from 'awesome-typescript-loader/dist/interfaces'
import chalk from 'chalk'
import {F_OK} from 'constants'
import CopyPlugin from 'copy-webpack-plugin'
import {accessSync, existsSync} from 'fs'
import {find} from 'globule'
import {flow, memoize} from 'lodash'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
// @ts-ignore
import OptimizeCssPlugin from 'optimize-css-assets-webpack-plugin'
import path from 'path'
// @ts-ignore
import TerserPlugin from 'terser-webpack-plugin'
import Webpack from 'webpack'
// @ts-ignore
import Weblog from 'webpack-log'
import nodeExternals from 'webpack-node-externals'

const logger = Weblog({name: 'wcb'})
const ADD = chalk.cyan('+')
const ELECTRON_RENDERER = 'electron-renderer'
const IGNORE_GLOBS = [
  '!**/.*',
  '!**/.*/**',
  '!**/node_modules/**',
  '!**/*.d.ts',
  '!**/__tests__/**',
  '!**/{,*.}{test,spec}.*',
]
const INVALID = '_-_|_-_'
const NON_NODE_TARGETS: Target[] = ['web', 'webworker']
const TRUTHY = /^(?:y|yes|true|1)$/i

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
  assets?: string | boolean
  assetsIgnore?: string[]
  atlOptions?: LoaderConfig
  chunkFilename?: string
  common?: string | boolean
  devServer?: boolean
  cssLoaders?: CSSLoader[]
  destination?: string
  environment?: string
  filename?: string
  hotReload?: boolean
  log?: string | boolean
  pattern?: string[]
  source?: string
  sourceMaps?: Devtool
  target?: Target
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
    post(internalOptions),
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

function createBase({log, target, ...opts}: InternalOptions): Configuration {
  info(log, 'Building...')
  return {
    target,
    context: path.resolve(opts.source),
    entry: find([...opts.pattern, ...IGNORE_GLOBS], {srcBase: opts.source})
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
                useCache: opts.hotReload,
                ...opts.atlOptions,
              },
            },
          ],
        },
      ],
    },
    output: {
      chunkFilename: `${opts.chunkFilename}.js`,
      filename: `${opts.filename}.js`,
      path: path.resolve(opts.destination),
      publicPath: '/',
    },
    plugins: [
      new Webpack.DefinePlugin({
        'process.env.IS_CLIENT': JSON.stringify(String(!isNodeTarget(target))),
        'process.env.NODE_ENV': opts.environment !== INVALID
          ? JSON.stringify(opts.environment)
          : 'undefined',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
    ],
    resolve: {extensions: ['.js', '.json', '.jsx', '.ts', '.tsx']},
  }
}

function addAssets({assetsIgnore: ignore, log, ...opts}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(opts.assets === false) { return configuration }
    const from = path.resolve(opts.assets === true ? opts.source : opts.assets)
    try {
      accessSync(from, F_OK)
    }
    catch(e) {
      return configuration
    }
    info(log, `${ADD} Copy assets from ${chalk.bold(from)}`)
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

function addCssLoaders({cssLoaders, log, ...opts}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(cssLoaders.length === 0) { return configuration }
    if(isNodeTarget(opts.target)) {
      info(log, `${ADD} CSS loaders`)
      return addRules(configuration, cssLoaders)
    }
    else if(opts.hotReload) {
      info(log, `${ADD} CSS loaders with ${chalk.bold('style-loader')}`)
      return addRules(configuration, cssLoaders.map(({use, ...rule}) => ({
        ...rule,
        use: ['style-loader', ...use],
      })))
    }
    else {
      info(log, `${ADD} CSS loaders with ${chalk.bold('extraction')}`)
      return addRules(addPlugins(configuration, [
        new MiniCssExtractPlugin({
          chunkFilename: `${opts.chunkFilename}.css`,
          filename: `${opts.filename}.css`,
        }),
      ]), cssLoaders.map(({use, ...rule}) => ({
        ...rule,
        use: [MiniCssExtractPlugin.loader, ...use],
      })))
    }
  }
}

function addDevServer({devServer, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!devServer) { return configuration }
    info(log, `${ADD} Webpack dev server`)
    return {
      ...configuration,
      devServer: {stats: {all: false, builtAt: true, errors: true}},
    }
  }
}

function addSourceMaps(opts: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!opts.sourceMaps) { return configuration }
    info(opts.log, `${ADD} Source maps`)
    return {
      ...configuration,
      devtool: opts.sourceMaps,
      output: {
        ...configuration.output,
        devtoolModuleFilenameTemplate: createFixPath(opts),
      },
    }
  }
}

function addHotReload({devServer, hotReload, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!hotReload) { return configuration }
    info(log, `${ADD} Hot module reloading`)
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
    info(log, `${ADD} Node target`)
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

function addProduction({log, ...opts}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(opts.environment !== 'production') { return configuration }
    info(log, `${ADD} Production`)
    let plugins: Webpack.Plugin[] = [
      new Webpack.LoaderOptionsPlugin({minimize: true, debug: false}),
      new TerserPlugin({parallel: true, sourceMap: !!opts.sourceMaps}),
    ]
    if(opts.cssLoaders.length > 0) {
      plugins = [...plugins, new OptimizeCssPlugin()]
    }
    return addPlugins(configuration, plugins)
  }
}

function post({log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    info(log, 'Done!')
    return configuration
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
    chunkFilename = '[id]',
    common = false,
    cssLoaders = [],
    destination = '',
    devServer = false,
    environment = process.env.NODE_ENV !== undefined
      ? process.env.NODE_ENV
      : INVALID,
    filename = '[name]',
    log = true,
    pattern = ['**/*.{j,t}s{,x}'],
    source = '.',
    target = 'web',
  } = options
  const {
    assetsIgnore = pattern,
    hotReload = !isNodeTarget(target) && TRUTHY.test(process.env.HOT_MODULES!),
  } = options
  const {
    sourceMaps = environment === 'production'
      ? false
      : hotReload
        ? 'cheap-module-eval-source-map'
        : devServer
          ? 'eval-source-map'
          : 'source-map',
  } = options
  return {
    assets,
    assetsIgnore,
    atlOptions,
    chunkFilename,
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

function createFixPath({sourceMaps}: InternalOptions) {
  const exists = memoize(existsSync)
  return (i: Webpack.DevtoolModuleFilenameTemplateInfo) => {
    // Tweak resource information
    let resource = i.absoluteResourcePath
    if(`${sourceMaps}`.includes('module') && !path.isAbsolute(resource)) {
      const maybe = path.resolve(resource)
      if(exists(maybe)) {
        resource = maybe
      }
    }
    resource = resource.split(path.sep).join('/')
    const protocol = path.isAbsolute(resource) ? 'file' : 'webpack'
    return `${protocol}://${resource.startsWith('/') ? '' : '/'}${resource}`
  }
}

function info(id: string | boolean, message: string) {
  if(id === false) { return }
  const prefix = id === true ? '' : `[${chalk.bold(id)}] `
  logger.info(`${prefix}${message}`)
}

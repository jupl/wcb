import {LoaderConfig} from 'awesome-typescript-loader/dist/interfaces'
import {F_OK} from 'constants'
import CopyPlugin from 'copy-webpack-plugin'
import ExtractTextPlugin from 'extract-text-webpack-plugin'
import {accessSync} from 'fs'
import {find} from 'globule'
import {flow} from 'lodash'
import {basename, dirname, extname, join, resolve, sep} from 'path'
import {
  Configuration as WebpackConfiguration,
  DefinePlugin,
  HotModuleReplacementPlugin,
  Loader,
  LoaderOptionsPlugin,
  Module as OldModule,
  Output as WebpackOutput,
  Plugin,
  Resolve as OldResolve,
  RuleSetRule,
} from 'webpack'
import nodeExternals from 'webpack-node-externals'

const ELECTRON_RENDERER_TARGET = 'electron-renderer'
const IGNORE_GLOBS = [
  '!**/coverage/**',
  '!**/node_modules/**',
  '!**/*.d.ts',
  '!**/__tests__/**',
  '!**/{,*.}{test,spec}.*',
]
const INVALID_ENVIRONMENT = '_-_|_-_'
const NON_NODE_TARGETS: Target[] = [
  'web',
  'webworker',
  ELECTRON_RENDERER_TARGET,
]
/* istanbul ignore next */
const protocol = process.platform === 'win32' ? 'file:///' : 'file://'

type Target = WebpackConfiguration['target']

/** Webpack entries */
export interface Entry {
  [name: string]: string[]
}

/** Webpack output */
export interface Output extends WebpackOutput {
  path: string
  filename: string
  publicPath: string
}

/** Webpack module resolution */
export interface Resolve extends OldResolve {
  extensions: string[]
}

/** Webpack configuration specific for this application */
export interface Configuration extends WebpackConfiguration {
  entry: Entry
  module: OldModule
  output: Output
  plugins: Plugin[]
  resolve: Resolve
}

/** Webpack loader for CSS family files */
export interface CSSLoader extends RuleSetRule {
  use: Loader[]
}

/** Options for webpack build */
export interface Options {
  assets?: string | false
  assetsIgnore?: string[]
  atlOptions?: LoaderConfig
  common?: string | boolean
  cssLoaders?: CSSLoader[]
  destination?: string
  environment?: string
  filename?: string
  hotReload?: boolean
  pattern?: string[]
  source?: string
  target?: WebpackConfiguration['target']
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
    addDevelopment(internalOptions),
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
  plugins: Plugin[],
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
  rules: RuleSetRule[],
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

type InternalOptions = {
  [P in keyof Options]-?: Options[P]
}

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
  const nodeTarget = NON_NODE_TARGETS.indexOf(target) === -1
  return {
    target,
    context: resolve(source),
    entry: find([...pattern, ...IGNORE_GLOBS], {srcBase: source})
      .map(file => ({
        base: basename(file, extname(file)),
        dir: dirname(file),
        file: `.${sep}${file}`,
      }))
      .reduce((obj, {base, dir, file}) => ({
        ...obj, [join(dir, base)]: [file],
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
      path: resolve(destination),
      publicPath: '/',
    },
    plugins: [
      new DefinePlugin({
        'process.env.IS_CLIENT': JSON.stringify(String(!nodeTarget)),
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
    const from = resolve(assets)
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
    if(common === false || Object.keys(configuration.entry).length === 0) {
      return configuration
    }
    return {
      ...configuration,
      optimization: {
        ...configuration.optimization,
        splitChunks: {
          cacheGroups: {
            common: {
              chunks: 'initial',
              minChunks: 2,
              name: common === true ? 'common' : common,
            },
          },
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
    return addRules(addPlugins(configuration, [
      new ExtractTextPlugin({
        allChunks: true,
        disable: isNodeTarget(target),
        filename: `${filename}.css`,
      }),
    ]), cssLoaders.map(({use, ...rule}) => ({
      ...rule,
      use: hotReload
        ? ['style-loader', ...use]
        : ExtractTextPlugin.extract({use, fallback: 'style-loader'}),
    })))
  }
}

function addDevelopment({environment, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(environment !== 'development') { return configuration }
    log('--- wcb: adding development configuration')
    return {
      ...configuration,
      devtool: 'inline-source-map',
      output: {
        ...configuration.output,
        devtoolModuleFilenameTemplate: ({absoluteResourcePath}) =>
          `${protocol}${absoluteResourcePath.split(sep).join('/')}`,
      },
    }
  }
}

function addHotReload({hotReload, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!hotReload) { return configuration }
    log('--- wcb: adding hot modules configuration')
    return addToEntries(addPlugins({
      ...configuration,
      optimization: {...configuration.optimization, noEmitOnErrors: true},
    }, [new HotModuleReplacementPlugin()]), ['webpack-hot-middleware/client'])
  }
}

function addNode({log, target}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!isNodeTarget(target) && target !== ELECTRON_RENDERER_TARGET) {
      return configuration
    }
    log('--- wcb: adding node configuration')
    const newConfiguration: Configuration = {
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
    return target !== ELECTRON_RENDERER_TARGET
      ? {...newConfiguration, externals: [nodeExternals()]}
      : newConfiguration
  }
}

function addProduction({environment, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(environment !== 'production') { return configuration }
    log('--- wcb: adding production configuration')
    const BabelMinifyPlugin = require('babel-minify-webpack-plugin')
    return addPlugins(configuration, [
      new LoaderOptionsPlugin({minimize: true, debug: false}),
      new BabelMinifyPlugin(),
    ])
  }
}

function isNodeTarget(target: Target) {
  return NON_NODE_TARGETS.indexOf(target) === -1
}

function optionsWithDefaults(options: Options): InternalOptions {
  const {
    assets = false,
    atlOptions = {},
    common = false,
    cssLoaders = [],
    destination = '',
    environment = process.env.NODE_ENV !== undefined
      ? String(process.env.NODE_ENV)
      : INVALID_ENVIRONMENT,
    filename = '[name]',
    hotReload = process.env.HOT_MODULES === 'true',
    log = () => undefined,
    pattern = ['**/*.{j,t}s{,x}'],
    source = '',
    target = 'web',
  } = options
  const {assetsIgnore = pattern} = options
  return {
    ...options,
    assets,
    assetsIgnore,
    atlOptions,
    common,
    cssLoaders,
    destination,
    environment,
    filename,
    hotReload,
    log,
    pattern,
    source,
    target,
  }
}

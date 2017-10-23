import * as BabiliPlugin from 'babili-webpack-plugin'
import {F_OK} from 'constants'
import * as CopyPlugin from 'copy-webpack-plugin'
import * as ExtractTextPlugin from 'extract-text-webpack-plugin'
import {accessSync} from 'fs'
import {find} from 'globule'
import {basename, dirname, extname, join, resolve, sep} from 'path'
import {
  Configuration as WebpackConfiguration,
  DefinePlugin,
  HotModuleReplacementPlugin,
  Loader,
  LoaderOptionsPlugin,
  NewModule,
  NewResolve,
  NewUseRule,
  NoEmitOnErrorsPlugin,
  Output as WebpackOutput,
  Plugin,
  Rule,
  optimize,
} from 'webpack'

const ignoreGlobs = [
  '!**/node_modules/**',
  '!**/*.d.ts',
  '!**/__tests__/**',
  '!**/{,*.}{test,spec}.*',
]
const nonNodeTargets: WebpackConfiguration['target'][] = [
  'web',
  'webworker',
  'electron-renderer',
]
/* istanbul ignore next */
const protocol = process.platform === 'win32' ? 'file:///' : 'file://'

/** Webpack entries */
export interface IEntry {
  /** Each entry is a list of modules */
  [name: string]: string[]
}

/**
 * Webpack entries
 * @deprecated Use IEntry instead
 */
export type Entry = IEntry

/** Webpack output */
export interface IOutput extends WebpackOutput {
  /** Path is provided */
  path: string
  /** Filename is provided */
  filename: string
  /** Public path is provided */
  publicPath: string
}

/**
 * Webpack output
 * @deprecated Use IOutput instead
 */
export type Output = IOutput

/** Webpack module resolution */
export interface IResolve extends NewResolve {
  /** Extensions is provided */
  extensions: string[]
}

/**
 * Webpack module resolution
 * @deprecated Use IResolve instead
 */
export type Resolve = IResolve

/** Webpack configuration specific for this application */
export interface IConfiguration extends WebpackConfiguration {
  /** Entries must be an object to list of modules */
  entry: IEntry
  /** Module follows Webpack 2 format */
  module: NewModule
  /** Output is provided */
  output: IOutput
  /** Plugins are specified */
  plugins: Plugin[]
  /** Resolve options are specified */
  resolve: IResolve
}

/**
 * Webpack configuration specific for this application
 * @deprecated Use IConfiguration instead
 */
export type Configuration = IConfiguration

/** Webpack loader for CSS family files */
export interface ICSSLoader extends NewUseRule {
  /** Use must be a list of loaders */
  use: Loader[]
}

/**
 * Webpack loader for CSS family files
 * @deprecated Use ICSSLoader instead
 */
export type CSSLoader = ICSSLoader

/** Options for webpack build */
export interface IOptions {
  /** Path that contains static assets (defaults to no static assets) */
  assets?: string
  /** Asset files to ignore when copying (defaults to pattern parameter) */
  assetsIgnore?: string[]
  /** Create a simple common chunk if multiple entries (defaults to false) */
  common?: string | boolean
  /** CSS loaders */
  cssLoaders?: ICSSLoader[]
  /** Path to write output to (defaults to working path) */
  destination?: string
  /** Environment to run under (defaults to NODE_ENV) */
  environment?: string
  /** Output bundle name structure for JS/CSS (defaults to [name]) */
  filename?: string
  /** If true then hot reload (defaults to HOT_RELOAD === 'true') */
  hotReload?: boolean
  /** Log function */
  log?(message: string): void
  /** Glob patterns to match (defaults to all TS files recursively) */
  pattern?: string[]
  /** Path that contains source files (defaults to working path) */
  source?: string
  /** Webpack target (defaults to web) */
  target?: WebpackConfiguration['target']
  /** If true then use Babel (defaults to false) */
  useBabel?: boolean
  /** If true then typecheck during compilation */
  typeCheck?: boolean
}

/**
 * Options for webpack build
 * @deprecated Use IOptions instead
 */
export type Options = IOptions

/**
 * Build Webpack configuration
 * @param options Options
 * @return Webpack configuration
 */
export function createConfiguration(options: IOptions = {}): IConfiguration {
  const {
    assets,
    common = false,
    cssLoaders = [],
    destination = '',
    environment = process.env.NODE_ENV !== undefined
      ? String(process.env.NODE_ENV)
      : undefined,
    filename = '[name]',
    hotReload = process.env.HOT_MODULES === 'true',
    log = () => undefined,
    pattern = ['**/*.ts{,x}'],
    source = '',
    target = 'web',
    useBabel = false,
    typeCheck = false,
  } = options
  const {assetsIgnore: ignore = pattern} = options

  // Create base configuration
  const nodeTarget = nonNodeTargets.indexOf(target) === -1
  let configuration: Readonly<IConfiguration> = {
    context: resolve(source),
    entry: find([...pattern, ...ignoreGlobs], {srcBase: source})
      .map(file => ({
        file: `.${sep}${file}`,
        base: basename(file, extname(file)),
        dir: dirname(file),
      }))
      .reduce((obj, {base, dir, file}) => ({
        ...obj,
        [join(dir, base)]: [file],
      }), {}),
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'awesome-typescript-loader',
              options: {
                useBabel,
                useCache: hotReload,
                transpileOnly: !typeCheck,
              },
            },
          ],
        },
      ],
    },
    output: {
      path: resolve(destination),
      filename: `${filename}.js`,
      publicPath: '/',
    },
    plugins: [
      new DefinePlugin({
        'process.env.IS_CLIENT': JSON.stringify(String(!nodeTarget)),
        'process.env.NODE_ENV': environment !== undefined
          ? JSON.stringify(environment)
          : 'undefined',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
    ],
    resolve: {extensions: ['.js', '.json', '.jsx', '.ts', '.tsx']},
    target,
  }
  log('--- wcb: making base configuration')

  // Add to configuration based on environment
  switch(environment) {
  case 'development':
    configuration = {
      ...configuration,
      devtool: 'inline-source-map',
      output: {
        ...configuration.output,
        devtoolModuleFilenameTemplate: ({absoluteResourcePath}) =>
          `${protocol}${absoluteResourcePath.split(sep).join('/')}`,
      },
    }
    log('--- wcb: adding development configuration')
    break
  case 'production':
    configuration = addPlugins(configuration, [
      new LoaderOptionsPlugin({minimize: true, debug: false}),
      new (BabiliPlugin as any)(), // tslint:disable-line:no-any
    ])
    log('--- wcb: adding production configuration')
    break
  default:
    break
  }

  // Include assets if specified
  if(assets !== undefined) {
    try {
      const from = resolve(assets)
      accessSync(from, F_OK)
      configuration = addPlugins(configuration, [
        new CopyPlugin([{from, ignore}]),
      ])
      log('--- wcb: adding assets configuration')
    }
    catch(e) {
      // Skip copy from assets
    }
  }

  // Set up Node specifics if applicable
  if(nodeTarget) {
    const nodeExternals = require('webpack-node-externals')
    configuration = {
      ...configuration,
      externals: [nodeExternals()], // tslint:disable-line:no-unsafe-any
    }
  }
  if(nodeTarget || target === 'electron-renderer') {
    configuration = {
      ...configuration,
      node: {
        __dirname: false,
        __filename: false,
        global: false,
        process: false,
        Buffer: false,
        setImmediate: false,
      },
    }
    log('--- wcb: adding node configuration')
  }

  // Set up common chunk if applicable
  if(common !== false && Object.keys(configuration.entry).length > 1) {
    configuration = addPlugins(configuration, [
      new optimize.CommonsChunkPlugin({
        name: common === true ? 'common' : common,
      }),
    ])
  }

  // Set up CSS loaders if applicable
  if(cssLoaders.length > 0) {
    configuration = addRules(addPlugins(configuration, [
      new ExtractTextPlugin({
        allChunks: true,
        disable: nodeTarget,
        filename: `${filename}.css`,
      }),
    ]), cssLoaders.map(({use, ...rule}) => ({
      ...rule,
      use: hotReload
        ? ['style-loader', ...use]
        : ExtractTextPlugin.extract({use, fallback: 'style-loader'}),
    })))
  }

  // Add hot reload support if specified
  if(hotReload) {
    configuration = addToEntries(addPlugins(configuration, [
      new HotModuleReplacementPlugin(),
      new NoEmitOnErrorsPlugin(),
    ]), ['webpack-hot-middleware/client'])
    log('--- wcb: adding hot modules configuration')
  }

  return configuration
}

/**
 * Add plugins to Webpack configuration
 * @param configuration Configuration to update
 * @param plugins Plugins to add
 * @return Updated configuration
 */
export function addPlugins(
  configuration: IConfiguration,
  plugins: Plugin[],
): IConfiguration {
  return {...configuration, plugins: [...configuration.plugins, ...plugins]}
}

/**
 * Add rules to Webpack configuration
 * @param configuration Configuration to update
 * @param rules Rules to add
 * @return Updated configuration
 */
export function addRules(
  configuration: IConfiguration,
  rules: Rule[],
): IConfiguration {
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
  configuration: IConfiguration,
  modules: string[],
): IConfiguration {
  return {
    ...configuration,
    entry: Object.keys(configuration.entry)
      .filter(key => Array.isArray(configuration.entry[key]))
      .reduce((previous, key) => ({
        ...previous,
        [key]: [...modules, ...configuration.entry[key]],
      }), {}),
  }
}

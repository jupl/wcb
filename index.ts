import * as BabiliPlugin from 'babili-webpack-plugin'
import {F_OK} from 'constants'
import * as CopyPlugin from 'copy-webpack-plugin'
import {accessSync} from 'fs'
import {find} from 'globule'
import {basename, dirname, extname, join, resolve, sep} from 'path'
import {
  Configuration as WebpackConfiguration,
  DefinePlugin,
  HotModuleReplacementPlugin,
  LoaderOptionsPlugin,
  NewModule,
  NewResolve,
  NoEmitOnErrorsPlugin,
  Output as WebpackOutput,
  Plugin,
  Rule,
  optimize,
} from 'webpack'
import * as nodeExternals from 'webpack-node-externals'

const ignoreGlobs = [
  '!**/node_modules/**',
  '!**/*.d.ts',
  '!**/__tests__/**',
  '!**/{,*.}{test,spec}.*',
]
const nonNodeTargets = ['web', 'webworker', 'electron-renderer']

/** Webpack entries */
export interface Entry {
  /** Each entry is a list of modules */
  [name: string]: string[]
}

/** Webpack output */
export interface Output extends WebpackOutput {
  /** Path is provided */
  path: string
  /** Filename is provided */
  filename: string
  /** Public path is provided */
  publicPath: string
}

/** Webpack module resolution */
export interface Resolve extends NewResolve {
  /** Extensions is provided */
  extensions: string[]
}

/** Webpack configuration specific for this application */
export interface Configuration extends WebpackConfiguration {
  /** Entries must be an object to list of modules */
  entry: Entry
  /** Module follows Webpack 2 format */
  module: NewModule
  /** Output is provided */
  output: Output
  /** Plugins are specified */
  plugins: Plugin[]
  /** Resolve options are specified */
  resolve: Resolve
}

/** Options for webpack build */
export interface Options {
  /** Path that contains static assets (defaults to no static assets) */
  assets?: string
  /** Asset files to ignore when copying (defaults to pattern parameter) */
  assetsIgnore?: string[]
  /** Create a simple common chunk if multiple entries (defaults to false) */
  common?: string | boolean
  /** Path to write output to (defaults to working path) */
  destination?: string
  /** Environment to run under (defaults to NODE_ENV) */
  environment?: string
  /** If true then hot reload (defaults to HOT_RELOAD === 'true') */
  hotReload?: boolean
  /** Log function */
  log?(message: string): void
  /** Glob patterns to match (defaults to all TS files recursively) */
  pattern?: string[]
  /** Path that contains source files (defaults to working path) */
  source?: string
  /** Webpack target (defaults to web) */
  target?: string
  /** If true then use Babel (defaults to false) */
  useBabel?: boolean
}

/**
 * Build Webpack configuration
 * @param options Options
 * @return Webpack configuration
 */
export function createConfiguration(options: Options = {}): Configuration {
  const {
    assets,
    common = false,
    destination = '',
    environment = process.env.NODE_ENV != undefined
      ? String(process.env.NODE_ENV)
      : undefined,
    hotReload = process.env.HOT_MODULES === 'true',
    log = () => undefined,
    pattern = ['**/*.ts{,x}'],
    source = '',
    target = 'web',
    useBabel = false,
  } = options
  const {assetsIgnore: ignore = pattern} = options

  // Create base configuration
  const nodeTarget = nonNodeTargets.indexOf(target) === -1
  let configuration: Readonly<Configuration> = {
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
              options: {useBabel, useCache: hotReload},
            },
          ],
        },
      ],
    },
    output: {
      path: resolve(destination),
      filename: '[name].js',
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
    configuration = {...configuration, devtool: 'inline-source-map'}
    log('--- wcb: adding development configuration')
    break
  case 'production':
    configuration = addPlugins(configuration, [
      new LoaderOptionsPlugin({minimize: true, debug: false}),
      // tslint:disable-next-line:no-any no-unsafe-any
      new (BabiliPlugin as any)(),
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
    configuration = {...configuration, externals: [nodeExternals()]}
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

  // Set up client specifics if applicable
  if(!nodeTarget
     && common !== false
     && Object.keys(configuration.entry).length > 1) {
    configuration = addPlugins(configuration, [
      new optimize.CommonsChunkPlugin({
        name: common === true ? 'common' : common,
      }),
    ])
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
  rules: Rule[],
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
      .reduce((previous, key) => ({
        ...previous,
        [key]: [...modules, ...configuration.entry[key]],
      }), {}),
  }
}

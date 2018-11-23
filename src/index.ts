import {LoaderConfig} from 'awesome-typescript-loader/dist/interfaces'
import chalk from 'chalk'
import {F_OK} from 'constants'
import CopyPlugin from 'copy-webpack-plugin'
import {accessSync, existsSync} from 'fs'
import {find} from 'globule'
import HtmlPlugin, {Options as HtmlPluginOptions} from 'html-webpack-plugin'
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
import {addPlugins, addRules, addToEntries} from './util'

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
const NON_NODE_TARGETS: Target[] = ['web', 'webworker']
const TRUTHY = /^(?:y|yes|true|1)$/i

type Chunk = Webpack.compilation.Chunk
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
  environment?: 'development' | 'production'
  filename?: string
  hotReload?: boolean
  html?: boolean | string | HtmlPluginOptions
  log?: string | boolean
  pattern?: string[]
  publicPath?: string
  source?: string
  sourceMaps?: Devtool
  split?: boolean
  target?: Target
}

// Expose utilities for reuse
export {addPlugins, addRules, addToEntries}

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
    addSplitting(internalOptions),
    addCommonChunk(internalOptions),
    addCssLoaders(internalOptions),
    addHotReload(internalOptions),
    addHtml(internalOptions),
    post(internalOptions),
  ])(createBase(internalOptions))
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
        ...obj,
        [path.join(dir, base)]: [file],
      }), {}),
    mode: opts.environment,
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
    optimization: {minimize: false, splitChunks: false},
    output: {
      chunkFilename: `${opts.chunkFilename}.js`,
      filename: `${opts.filename}.js`,
      path: path.resolve(opts.destination),
      publicPath: opts.publicPath,
    },
    plugins: [
      new Webpack.DefinePlugin({
        'process.env.IS_CLIENT': JSON.stringify(String(!isNodeTarget(target))),
        'process.env.WEBPACK_BUILD': '"true"',
      }),
    ],
    resolve: {extensions: ['.js', '.json', '.jsx', '.ts', '.tsx']},
  }
}

function addAssets({assetsIgnore, log, ...opts}: InternalOptions) {
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
    const ignore = [...IGNORE_GLOBS, ...assetsIgnore]
    return addPlugins(configuration, [new CopyPlugin([{from, ignore}])])
  }
}

function addCommonChunk({common, split}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(split || common === false) { return configuration }
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
    const suffix = typeof opts.sourceMaps === 'string'
      ? ` (${chalk.bold(opts.sourceMaps)})`
      : ''
    info(opts.log, `${ADD} Source maps${suffix}`)
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

function addHtml({environment, html, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(html === false) { return configuration }
    info(log, `${ADD} HTML generation`)
    let baseOptions: HtmlPluginOptions = {
      meta: {
        'X-UA-Compatible': {
          content: 'IE=edge,chrome=1',
          'http-equiv': 'X-UA-Compatible',
        },
        viewport: [
          'minimum-scale=1',
          'initial-scale=1',
          'width=device-width',
          'shrink-to-fit=no',
        ].join(','),
      },
      // tslint:disable-next-line:no-any
      minify: (environment === 'production') as any,
      title: 'Application',
    }
    switch(typeof html) {
    case 'string':
      baseOptions = {
        ...baseOptions,
        meta: {...baseOptions.meta, charset: {charset: 'UTF-8'}},
        template: html,
      }
      break
    case 'object':
      if(html.template !== undefined) {
        baseOptions = {
          ...baseOptions,
          meta: {...baseOptions.meta, charset: {charset: 'UTF-8'}},
        }
      }
      baseOptions = {...baseOptions, ...html}
      break
    default:
      break
    }
    const plugins = Object
      .keys(configuration.entry)
      .map(chunk => new HtmlPlugin({
        ...baseOptions,
        chunks: [chunk],
        filename: `${chunk}.html`,
      }))
    return addPlugins(configuration, plugins)
  }
}

// https://hackernoon.com/f8a9df5b7758
function addSplitting({log, split}: InternalOptions) {
  return (configuration: Configuration) => {
    if(!split) { return configuration }
    info(log, `${ADD} Code splitting`)
    return {
      ...configuration,
      optimization: {
        ...configuration.optimization,
        splitChunks: {
          cacheGroups: {
            vendor: {name: vendorChunkName, test: /[\\/]node_modules[\\/]/},
          },
          chunks: 'all',
          maxInitialRequests: Infinity,
          minSize: 0,
          name: chunkName,
        },
      },
    }
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
    common = false,
    cssLoaders = [],
    destination = '',
    devServer = false,
    environment = process.env.NODE_ENV === 'production'
      ? 'production'
      : 'development',
    html = false,
    log = true,
    pattern = ['**/*.{j,t}s{,x}'],
    source = '.',
    split = false,
    target = 'web',
  } = options
  const {
    assetsIgnore = pattern,
    filename = environment === 'production' && html !== false
      ? '[contenthash]'
      : '[name]',
    hotReload = !isNodeTarget(target) && TRUTHY.test(process.env.HOT_MODULES!),
    publicPath = '',
  } = options
  const {
    chunkFilename = filename,
    sourceMaps = environment !== 'development'
      ? false
      : hotReload
        ? 'cheap-module-eval-source-map'
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
    html,
    log,
    pattern,
    publicPath,
    source,
    sourceMaps,
    split,
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

function chunkName(_: unknown, chunks: Chunk[]) {
  const names = chunks.map(({name}) => name).sort()
  if(names.length === 1) { return names[0] }
  const chunk = names
    .map(name => name.replace(/\//g, '~'))
    .join('+')
  return `_chunks/${chunk}`
}

function vendorChunkName(module: any) { // tslint:disable-line:no-any
  const pkg = module
    .context
    .match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)
  return `_vendor/${pkg[1].replace('@', '')}`
}

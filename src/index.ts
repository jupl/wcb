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
import ScriptExtHtmlPlugin from 'script-ext-html-webpack-plugin'
// @ts-ignore
import TerserPlugin from 'terser-webpack-plugin'
import TSConfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import Webpack from 'webpack'
// @ts-ignore
import Weblog from 'webpack-log'
import nodeExternals from 'webpack-node-externals'
import {Configuration, Options} from './types'
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
type Target = Webpack.Configuration['target']

// Expose utilities for reuse
export {addPlugins, addRules, addToEntries}

/**
 * Build Webpack configuration
 * @param options Options
 * @return Webpack configuration
 */
export function createConfiguration(options: Options = {}): Configuration {
  const internalOptions = optionsWithDefaults(options)
  const configuration = flow([
    addPaths(internalOptions),
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
  ])(createBase(internalOptions))
  info(internalOptions.log, 'Done!')
  return configuration
}

type InternalOptions = { [P in keyof Options]-?: Options[P] }

function createBase({target, ...opts}: InternalOptions): Configuration {
  info(opts.log, 'Building...')
  const {
    module: {rules = [], ...module} = {},
    optimization,
    output,
    plugins = [],
    resolve = {},
  } = opts.webpack
  return {
    ...opts.webpack,
    target,
    context: path.resolve(opts.source),
    entry: find([...opts.pattern, ...IGNORE_GLOBS], {srcBase: opts.source})
      .map(file => ({
        base: path.basename(file, path.extname(file)),
        dir: path.dirname(file),
        file: `.${path.sep}${file}`,
      }))
      .reduce((obj, {base: b, dir, file}) => ({
        ...obj,
        [path.join(dir, b)]: [file],
      }), {}),
    mode: opts.environment,
    module: {
      ...module,
      rules: [
        ...rules,
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
    optimization: {...optimization, minimize: false, splitChunks: false},
    output: {
      ...output,
      chunkFilename: `${opts.chunkFilename}.js`,
      filename: `${opts.filename}.js`,
      path: path.resolve(opts.destination),
    },
    plugins: [
      ...plugins,
      new Webpack.DefinePlugin({
        'process.env.IS_CLIENT': JSON.stringify(String(!isNodeTarget(target))),
        'process.env.WEBPACK_BUILD': '"true"',
      }),
    ],
    resolve: {
      ...resolve,
      extensions: ['.js', '.json', '.jsx', '.ts', '.tsx'],
      plugins: Array.isArray(resolve.plugins) ? resolve.plugins : [],
    },
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

function addCommonChunk({common, split, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(split || common === false) { return configuration }
    info(log, `${ADD} common chunk`)
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

function addDevServer({devServer, log}: InternalOptions) {
  return (configuration: Configuration): Configuration => {
    if(!devServer) { return configuration }
    info(log, `${ADD} Webpack dev server`)
    const {devServer: ds = {}} = configuration
    return {
      ...configuration,
      devServer: {
        ...ds,
        stats: {
          ...(typeof ds.stats === 'object' ? ds.stats : {}),
          all: false,
          builtAt: true,
          errors: true,
        },
      },
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
        ...configuration.node,
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
      inject: 'head',
      // tslint:disable-next-line:no-any
      minify: (environment === 'production') as any,
      title: 'Application',
    }
    const baseMeta = {
      'X-UA-Compatible': {
        content: 'IE=edge,chrome=1',
        'http-equiv': 'X-UA-Compatible',
      },
      charset: {charset: 'UTF-8'},
      viewport: [
        'minimum-scale=1',
        'initial-scale=1',
        'width=device-width',
        'shrink-to-fit=no',
      ].join(','),
    }
    let addMeta = true
    switch(typeof html) {
    case 'string':
      addMeta = false
      baseOptions = {...baseOptions, template: html}
      break
    case 'object':
      addMeta = html.template === undefined
      baseOptions = {...baseOptions, ...html}
      break
    default:
      break
    }
    if(addMeta) {
      baseOptions = {
        ...baseOptions,
        meta: {...baseMeta, ...baseOptions.meta},
      }
    }
    const entries = Object.keys(configuration.entry)
    const plugins = entries.map(chunk => new HtmlPlugin({
      ...baseOptions,
      chunks: [chunk],
      filename: `${chunk}.html`,
    }))
    return addPlugins(configuration, [
      ...plugins,
      new ScriptExtHtmlPlugin({defaultAttribute: 'async', defer: entries}),
    ])
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
          ...configuration.optimization.splitChunks,
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

function addPaths({log, paths}: InternalOptions) {
  return (configuration: Configuration) => {
    if(!paths) { return configuration }
    info(log, `${ADD} TS config paths`)
    return {
      ...configuration,
      resolve: {
        ...configuration.resolve,
        plugins: [
          ...configuration.resolve.plugins,
          new TSConfigPathsPlugin({
            extensions: configuration.resolve.extensions,
          }),
        ],
      },
    }
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
    paths = false,
    pattern = ['**/*.{j,t}s{,x}'],
    source = '.',
    split = false,
    target = 'web',
    webpack = {},
  } = options
  const {
    assetsIgnore = pattern,
    filename = environment === 'production' && html !== false
      ? '[contenthash]'
      : '[name]',
    hotReload = !isNodeTarget(target) && TRUTHY.test(process.env.HOT_MODULES!),
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
    paths,
    pattern,
    source,
    sourceMaps,
    split,
    target,
    webpack,
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
  const names = chunks.map(({name}) => name).filter(name => !!name).sort()
  if(names.length <= 1) { return names[0] }
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

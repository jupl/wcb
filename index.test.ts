import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import {sep} from 'path'
import {DefinePlugin, HotModuleReplacementPlugin, Plugin} from 'webpack'
import {CSSLoader, Configuration, createConfiguration} from './src'

// tslint:disable:no-duplicate-string no-magic-numbers

const cssLoaders: CSSLoader[] = [
  {test: /\.css$/, use: ['css-loader']},
  {test: /\.scss$/, use: ['css-loader', 'sass-loader']},
]
const devServer: Configuration['devServer'] = {
  stats: {all: false, builtAt: true, errors: true},
}
const expectedConfig: Configuration = {
  context: __dirname,
  devtool: 'source-map',
  entry: {
    extra: [`.${sep}extra.ts`],
    'src/index': [`.${sep}src${sep}index.ts`],
    'src/util': [`.${sep}src${sep}util.ts`],
  },
  mode: 'development',
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
              useCache: false,
            },
          },
        ],
      },
    ],
  },
  optimization: {minimize: false, splitChunks: false},
  output: {
    chunkFilename: '[name].js',
    filename: '[name].js',
    path: __dirname,
    publicPath: '',
  },
  plugins: undefined!,
  resolve: {extensions: ['.js', '.json', '.jsx', '.ts', '.tsx']},
  target: 'web',
}
const expectedPlugins: Plugin[] = [
  new DefinePlugin({
    'process.env.IS_CLIENT': '"true"',
    'process.env.WEBPACK_BUILD': '"true"',
  }),
]

describe('createConfig', () => { // tslint:disable-line:no-big-function
  let env: string | undefined

  beforeEach(() => {
    env = process.env.NODE_ENV
    delete process.env.NODE_ENV // tslint:disable-line:no-object-mutation
  })

  afterEach(() => {
    process.env.NODE_ENV = env // tslint:disable-line:no-object-mutation
  })

  it('should build with base options', () => {
    const config = createConfiguration({log: 'Base'})
    const {devtoolModuleFilenameTemplate} = config.output
    expect(config).toEqual({
      ...expectedConfig,
      output: {...expectedConfig.output, devtoolModuleFilenameTemplate},
      plugins: expectedPlugins,
    })
  })

  it('should build with production environment', () => {
    // tslint:disable-next-line:no-object-mutation
    process.env.NODE_ENV = 'production'
    const {
      plugins: plugins1,
      ...config
    } = createConfiguration()
    const {
      plugins: plugins2,
    } = createConfiguration({cssLoaders, environment: 'production'})
    const sharedPlugins = [
      new DefinePlugin({
        'process.env.IS_CLIENT': '"true"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
    ]
    expect(config).toEqual({
      ...expectedConfig,
      devtool: undefined,
      mode: 'production',
      output: {
        ...expectedConfig.output,
        devtoolModuleFilenameTemplate: undefined,
      },
    })
    expect(plugins1).toHaveLength(3)
    expect(plugins2).toHaveLength(5)
    expect(plugins1).toEqual(expect.arrayContaining(sharedPlugins))
    expect(plugins2).toEqual(expect.arrayContaining(sharedPlugins))
  })

  it('should build with assets', () => {
    const {plugins, ...config} = createConfiguration({assets: true})
    const {devtoolModuleFilenameTemplate} = config.output
    expect(config).toEqual({
      ...expectedConfig,
      output: {...expectedConfig.output, devtoolModuleFilenameTemplate},
    })
    expect(plugins).toHaveLength(2)
    expect(plugins).toEqual(expect.arrayContaining(expectedPlugins))
  })

  it('should build with invalid assets', () => {
    const config = createConfiguration({assets: 'path/to/assets'})
    const {devtoolModuleFilenameTemplate} = config.output
    expect(config).toEqual({
      ...expectedConfig,
      output: {...expectedConfig.output, devtoolModuleFilenameTemplate},
      plugins: expectedPlugins,
    })
  })

  it('should build with node', () => {
    const config1 = createConfiguration({target: 'node'})
    const config2 = createConfiguration({target: 'electron-renderer'})
    expect(config1.node).toEqual(config2.node)
    expect(config1.node).toEqual({
      Buffer: false,
      __dirname: false,
      __filename: false,
      global: false,
      process: false,
      setImmediate: false,
    })
    expect(config1.externals).toHaveLength(1)
    expect(config2.externals).toBeUndefined()
  })

  it('should build with common chunks', () => {
    const config1 = createConfiguration({common: true})
    const config2 = createConfiguration({common: 'shared'})
    expect(config1).toEqual({
      ...expectedConfig,
      optimization: {
        ...expectedConfig.optimization,
        splitChunks: {
          cacheGroups: {
            common: {name: 'common', chunks: 'initial', minChunks: 2},
          },
        },
      },
      output: {
        ...expectedConfig.output,
        devtoolModuleFilenameTemplate: config1
          .output
          .devtoolModuleFilenameTemplate,
      },
      plugins: expectedPlugins,
    })
    expect(config2).toEqual({
      ...expectedConfig,
      optimization: {
        ...expectedConfig.optimization,
        splitChunks: {
          cacheGroups: {
            common: {name: 'shared', chunks: 'initial', minChunks: 2},
          },
        },
      },
      output: {
        ...expectedConfig.output,
        devtoolModuleFilenameTemplate: config2
          .output
          .devtoolModuleFilenameTemplate,
      },
      plugins: expectedPlugins,
    })
  })

  it('should build with CSS loaders', () => {
    const config1 = createConfiguration({cssLoaders})
    const config2 = createConfiguration({cssLoaders, hotReload: true})
    const config3 = createConfiguration({cssLoaders, target: 'node'})
    expect(config1).toEqual({
      ...expectedConfig,
      module: {
        ...expectedConfig.module,
        rules: [
          ...expectedConfig.module.rules,
          {
            test: /\.css$/,
            use: [MiniCssExtractPlugin.loader, 'css-loader'],
          },
          {
            test: /\.scss$/,
            use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
          },
        ],
      },
      output: {
        ...expectedConfig.output,
        devtoolModuleFilenameTemplate: config1
          .output
          .devtoolModuleFilenameTemplate,
      },
      plugins: [
        ...expectedPlugins,
        new MiniCssExtractPlugin({
          chunkFilename: '[name].css',
          filename: '[name].css',
        }),
      ],
    })
    expect(config2).toEqual({
      ...expectedConfig,
      devtool: 'cheap-module-eval-source-map',
      entry: {
        extra: [
          'webpack-hot-middleware/client',
          `.${sep}extra.ts`,
        ],
        'src/index': [
          'webpack-hot-middleware/client',
          `.${sep}src${sep}index.ts`,
        ],
        'src/util': [
          'webpack-hot-middleware/client',
          `.${sep}src${sep}util.ts`,
        ],
      },
      module: {
        ...expectedConfig.module,
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
                  useCache: true,
                },
              },
            ],
          },
          {
            test: /\.css$/,
            use: ['style-loader', 'css-loader'],
          },
          {
            test: /\.scss$/,
            use: ['style-loader', 'css-loader', 'sass-loader'],
          },
        ],
      },
      optimization: {...expectedConfig.optimization, noEmitOnErrors: true},
      output: {
        ...expectedConfig.output,
        devtoolModuleFilenameTemplate: config2
          .output
          .devtoolModuleFilenameTemplate,
      },
      plugins: [
        ...expectedPlugins,
        new HotModuleReplacementPlugin(),
      ],
    })
    expect(config3.module.rules).toEqual([
      ...expectedConfig.module.rules,
      {
        test: /\.css$/,
        use: ['css-loader'],
      },
      {
        test: /\.scss$/,
        use: ['css-loader', 'sass-loader'],
      },
    ])
  })

  it('should build with hot reload', () => {
    const config1 = createConfiguration({hotReload: true})
    const config2 = createConfiguration({devServer: true, hotReload: true})
    const localExpectedConfig = {
      ...expectedConfig,
      devtool: 'cheap-module-eval-source-map',
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
                  useCache: true,
                },
              },
            ],
          },
        ],
      },
      optimization: {...expectedConfig.optimization, noEmitOnErrors: true},
      plugins: [...expectedPlugins, new HotModuleReplacementPlugin()],
    }
    expect(config1).toEqual({
      ...localExpectedConfig,
      entry: {
        extra: [
          'webpack-hot-middleware/client',
          `.${sep}extra.ts`,
        ],
        'src/index': [
          'webpack-hot-middleware/client',
          `.${sep}src${sep}index.ts`,
        ],
        'src/util': [
          'webpack-hot-middleware/client',
          `.${sep}src${sep}util.ts`,
        ],
      },
      output: {
        ...expectedConfig.output,
        devtoolModuleFilenameTemplate: config1
          .output
          .devtoolModuleFilenameTemplate,
      },
    })
    expect(config2).toEqual({
      ...localExpectedConfig,
      devServer: {...devServer, hot: true},
      output: {
        ...expectedConfig.output,
        devtoolModuleFilenameTemplate: config2
          .output
          .devtoolModuleFilenameTemplate,
      },
    })
  })

  it('should build with tweaked awesome-typescript-loader options', () => {
    const config = createConfiguration({
      atlOptions: {useBabel: true, configFileName: 'tsconfig.other.json'},
    })
    const {devtoolModuleFilenameTemplate} = config.output
    expect(config).toEqual({
      ...expectedConfig,
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
                  configFileName: 'tsconfig.other.json',
                  forceIsolatedModules: true,
                  transpileOnly: true,
                  useBabel: true,
                  useCache: false,
                },
              },
            ],
          },
        ],
      },
      output: {...expectedConfig.output, devtoolModuleFilenameTemplate},
      plugins: expectedPlugins,
    })
  })

  it('should build with dev server', () => {
    const config = createConfiguration({devServer: true})
    const {devtoolModuleFilenameTemplate} = config.output
    expect(config).toEqual({
      ...expectedConfig,
      devServer,
      output: {...expectedConfig.output, devtoolModuleFilenameTemplate},
      plugins: expectedPlugins,
    })
  })

  it('should remap filenames for source maps as expected', () => {
    const config1 = createConfiguration({log: false})
    const config2 = createConfiguration({
      log: false,
      sourceMaps: 'cheap-module-eval-source-map',
    })
    const config3 = createConfiguration({log: false, sourceMaps: true})
    const fixPath1 = config1.output.devtoolModuleFilenameTemplate as Function
    const fixPath2 = config2.output.devtoolModuleFilenameTemplate as Function
    const fixPath3 = config3.output.devtoolModuleFilenameTemplate as Function
    expect(fixPath1).toBeInstanceOf(Function)
    expect(fixPath2).toBeInstanceOf(Function)
    expect(fixPath3).toBeInstanceOf(Function)
    expect(fixPath1({absoluteResourcePath: 'some/path'}))
      .toEqual('webpack:///some/path')
    expect(fixPath1({absoluteResourcePath: '/some/path'}))
      .toEqual('file:///some/path')
    expect(fixPath2({absoluteResourcePath: 'garbage'}))
      .toEqual('webpack:///garbage')
    expect(fixPath2({
      absoluteResourcePath: 'src/index.ts',
    }).indexOf('file:///')).toBe(0)
  })

  it('should build with code splitting', () => {
    const config = createConfiguration({split: true})
    const {optimization, output: {devtoolModuleFilenameTemplate}} = config
    if(optimization === undefined) { throw new Error() }
    const {splitChunks} = optimization
    if(typeof splitChunks !== 'object') { throw new Error() }
    if(typeof splitChunks.cacheGroups !== 'object') { throw new Error() }
    const {cacheGroups} = splitChunks
    if(cacheGroups instanceof RegExp) { throw new Error() }
    if(typeof cacheGroups.vendor !== 'object') { throw new Error() }
    const chunkName = splitChunks.name
    if(typeof chunkName !== 'function') { throw new Error() }
    const vendorChunkName = cacheGroups.vendor.name
    if(typeof vendorChunkName !== 'function') { throw new Error() }
    expect(config).toEqual({
      ...expectedConfig,
      optimization: {
        ...expectedConfig.optimization,
        splitChunks: {
          cacheGroups: {vendor: cacheGroups.vendor},
          chunks: 'all',
          maxInitialRequests: Infinity,
          minSize: 0,
          name: chunkName,
        },
      },
      output: {...expectedConfig.output, devtoolModuleFilenameTemplate},
      plugins: expectedPlugins,
    })
    expect(chunkName(undefined, [{name: 'amodule'}]))
      .toBe('amodule')
    expect(chunkName(undefined, [{name: 'amodule'}, {name: 'a/module'}]))
      .toBe('_chunks/a~module+amodule')
    expect(vendorChunkName({context: '/some/node_modules/pack/file.js'}))
      .toBe('_vendor/pack')
  })

  it('should build with html', () => {
    const {plugins: plugins1, ...config} = createConfiguration({html: true})
    const {plugins: plugins2} = createConfiguration({html: '.layout.html'})
    const {plugins: plugins3} = createConfiguration({
      environment: 'production',
      html: {template: '.layout.html'},
    })
    const {devtoolModuleFilenameTemplate} = config.output
    expect(config).toEqual({
      ...expectedConfig,
      output: {...expectedConfig.output, devtoolModuleFilenameTemplate},
    })
    expect(plugins1).toHaveLength(4)
    expect(plugins1).toEqual(expect.arrayContaining(expectedPlugins))
    expect(plugins2).toHaveLength(4)
    expect(plugins2).toEqual(expect.arrayContaining(expectedPlugins))
    expect(plugins3).toHaveLength(6)
    expect(plugins3).toEqual(expect.arrayContaining(expectedPlugins))
  })
})

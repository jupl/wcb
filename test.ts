import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import {sep} from 'path'
import {DefinePlugin, HotModuleReplacementPlugin, Plugin} from 'webpack'
import {CSSLoader, Configuration, addRules, createConfiguration} from './src'

// tslint:disable:no-duplicate-string no-magic-numbers

const fixPath = createConfiguration({
  log: false,
}).output.devtoolModuleFilenameTemplate
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
  },
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
              useCache: false,
            },
          },
        ],
      },
    ],
  },
  output: {
    chunkFilename: '[id].js',
    devtoolModuleFilenameTemplate: fixPath,
    filename: '[name].js',
    path: __dirname,
    publicPath: '/',
  },
  plugins: undefined!,
  resolve: {extensions: ['.js', '.json', '.jsx', '.ts', '.tsx']},
  target: 'web',
}
const expectedPlugins: Plugin[] = [
  new DefinePlugin({
    'process.env.IS_CLIENT': '"true"',
    'process.env.NODE_ENV': 'undefined',
    'process.env.WEBPACK_BUILD': '"true"',
  }),
]

describe('createConfig', () => { // tslint:disable-line:no-big-function
  let env: string | undefined

  beforeAll(() => {
    env = process.env.NODE_ENV
    delete process.env.NODE_ENV // tslint:disable-line:no-object-mutation
  })

  afterAll(() => {
    process.env.NODE_ENV = env // tslint:disable-line:no-object-mutation
  })

  it('should build with base options', () => {
    const config = createConfiguration({log: 'base'})
    expect(config).toEqual({...expectedConfig, plugins: expectedPlugins})
    const {output: {devtoolModuleFilenameTemplate}} = config
    expect(devtoolModuleFilenameTemplate).toBeInstanceOf(Function)
    expect((devtoolModuleFilenameTemplate as Function)({
      absoluteResourcePath: `some/path`,
    })).toEqual('webpack:///some/path')
    expect((devtoolModuleFilenameTemplate as Function)({
      absoluteResourcePath: `/some/path`,
    })).toEqual('file:///some/path')
  })

  it('should build with production environment', () => {
    const {
      plugins: plugins1,
      ...config
    } = createConfiguration({environment: 'production'})
    const {
      plugins: plugins2,
    } = createConfiguration({cssLoaders, environment: 'production'})
    const sharedPlugins = [
      new DefinePlugin({
        'process.env.IS_CLIENT': '"true"',
        'process.env.NODE_ENV': '"production"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
    ]
    expect(config).toEqual({
      ...expectedConfig,
      devtool: undefined,
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
    const {plugins, ...config} = createConfiguration({assets: ''})
    expect(config).toEqual(expectedConfig)
    expect(plugins).toHaveLength(2)
    expect(plugins).toEqual(expect.arrayContaining(expectedPlugins))
  })

  it('should build with invalid assets', () => {
    expect(createConfiguration({assets: 'path/to/assets'})).toEqual({
      ...expectedConfig,
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
        splitChunks: {
          cacheGroups: {
            common: {name: 'common', chunks: 'initial', minChunks: 2},
          },
        },
      },
      plugins: expectedPlugins,
    })
    expect(config2).toEqual({
      ...expectedConfig,
      optimization: {
        splitChunks: {
          cacheGroups: {
            common: {name: 'shared', chunks: 'initial', minChunks: 2},
          },
        },
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
      plugins: [
        ...expectedPlugins,
        new MiniCssExtractPlugin({
          chunkFilename: '[id].css',
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
      optimization: {noEmitOnErrors: true},
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
      optimization: {noEmitOnErrors: true},
      plugins: [...expectedPlugins, new HotModuleReplacementPlugin()],
    }
    expect(createConfiguration({hotReload: true})).toEqual({
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
      },
    })
    expect(createConfiguration({devServer: true, hotReload: true})).toEqual({
      ...localExpectedConfig,
      devServer: {...devServer, hot: true},
    })
  })

  it('should build with tweaked awesome-typescript-loader options', () => {
    expect(createConfiguration({
      atlOptions: {useBabel: true, configFileName: 'tsconfig.other.json'},
    })).toEqual({
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
      plugins: expectedPlugins,
    })
  })

  it('should build with dev server', () => {
    expect(createConfiguration({devServer: true})).toEqual({
      ...expectedConfig,
      devServer,
      devtool: 'eval-source-map',
      plugins: expectedPlugins,
    })
  })
})

test('addRules', () => {
  const configuration = createConfiguration()
  const {module} = addRules(configuration, [
    {test: /\.css$/, use: ['style-loader', 'css-loader']},
    {test: /\.(gif|jpg|jpeg|png|svg)$/, use: ['file-loader']},
  ])
  expect(module).toEqual({
    rules: [
      ...configuration.module.rules,
      {test: /\.css$/, use: ['style-loader', 'css-loader']},
      {test: /\.(gif|jpg|jpeg|png|svg)$/, use: ['file-loader']},
    ],
  })
})

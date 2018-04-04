import * as BabiliPlugin from 'babili-webpack-plugin'
import * as ExtractTextPlugin from 'extract-text-webpack-plugin'
import * as HardSourcePlugin from 'hard-source-webpack-plugin'
import {sep} from 'path'
import {
  Configuration,
  DefinePlugin,
  HotModuleReplacementPlugin,
} from 'webpack'
import {CSSLoader, addRules, createConfiguration} from '.'

// tslint:disable:no-magic-numbers

const expectedConfig: Configuration = {
  mode: 'none',
  context: __dirname,
  entry: {
    extra: [`.${sep}extra.ts`],
    index: [`.${sep}index.ts`],
  },
  module: {
    rules: [
      {
        exclude: /node_modules/,
        test: /\.[jt]sx?$/,
        use: [
          {
            loader: 'awesome-typescript-loader',
            options: {
              useBabel: false,
              useCache: false,
              transpileOnly: true,
              cacheDirectory: 'node_modules/.awcache',
              forceIsolatedModules: true,
            },
          },
        ],
      },
    ],
  },
  output: {
    filename: '[name].js',
    path: __dirname,
    publicPath: '/',
  },
  resolve: {
    extensions: ['.js', '.json', '.jsx', '.ts', '.tsx'],
  },
  target: 'web',
}
const protocol = process.platform === 'win32' ? 'file:///' : 'file://'

describe('createConfig', () => {
  let env: string | undefined

  beforeAll(() => {
    env = process.env.NODE_ENV
    delete process.env.NODE_ENV // tslint:disable-line:no-object-mutation
  })

  afterAll(() => {
    process.env.NODE_ENV = env // tslint:disable-line:no-object-mutation
  })

  it('should build with no environment', () => {
    expect(createConfiguration()).toEqual({...expectedConfig, plugins: [
      new DefinePlugin({
        'process.env.NODE_ENV': 'undefined',
        'process.env.IS_CLIENT': '"true"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
      new HardSourcePlugin(),
    ]})
  })

  it('should build with development environment', () => {
    const {
      devtool,
      plugins,
      output: {devtoolModuleFilenameTemplate, ...output},
      ...config,
    } = createConfiguration({environment: 'development'})
    const data = {absoluteResourcePath: `some${sep}path`}
    expect({...config, output}).toEqual(expectedConfig)
    expect(devtoolModuleFilenameTemplate).toBeInstanceOf(Function)
    expect((devtoolModuleFilenameTemplate as Function)(data))
      .toEqual(`${protocol}some/path`)
    expect(devtool).toEqual('inline-source-map')
    expect(plugins).toEqual([
      new DefinePlugin({
        'process.env.NODE_ENV': '"development"',
        'process.env.IS_CLIENT': '"true"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
      new HardSourcePlugin(),
    ])
  })

  it('should build with production environment', () => {
    const {plugins, ...config} = createConfiguration({
      environment: 'production',
    })
    expect(config).toEqual(expectedConfig)
    expect(plugins).toHaveLength(4)
    expect(plugins).toEqual(expect.arrayContaining([
      new DefinePlugin({
        'process.env.NODE_ENV': '"production"',
        'process.env.IS_CLIENT': '"true"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
      new HardSourcePlugin(),
      new (BabiliPlugin as any)(), // tslint:disable-line:no-any
    ]))
  })

  it('should build with assets', () => {
    const {plugins, ...config} = createConfiguration({assets: ''})
    expect(config).toEqual(expectedConfig)
    expect(plugins).toHaveLength(3)
    expect(plugins).toEqual(expect.arrayContaining([
      new DefinePlugin({
        'process.env.NODE_ENV': 'undefined',
        'process.env.IS_CLIENT': '"true"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
      new HardSourcePlugin(),
    ]))
  })

  it('should build with invalid assets', () => {
    expect(createConfiguration({assets: 'path/to/assets'})).toEqual({
      ...expectedConfig,
      plugins: [
        new DefinePlugin({
          'process.env.NODE_ENV': 'undefined',
          'process.env.IS_CLIENT': '"true"',
          'process.env.WEBPACK_BUILD': '"true"',
        }),
        new HardSourcePlugin(),
      ],
    })
  })

  it('should build with node', () => {
    const {externals, ...config} = createConfiguration({target: 'node'})
    expect(config).toEqual({
      ...expectedConfig,
      plugins: [
        new DefinePlugin({
          'process.env.NODE_ENV': 'undefined',
          'process.env.IS_CLIENT': '"false"',
          'process.env.WEBPACK_BUILD': '"true"',
        }),
        new HardSourcePlugin(),
      ],
      node: {
        __dirname: false,
        __filename: false,
        global: false,
        process: false,
        Buffer: false,
        setImmediate: false,
      },
      target: 'node',
    })
    expect(externals).toHaveLength(1)
  })

  it('should build with common chunks', () => {
    const config1 = createConfiguration({common: true})
    const config2 = createConfiguration({
      common: 'shared',
    })
    expect(config1.optimization!.splitChunks).toEqual({
      cacheGroups: {
        common: {
          name: 'common',
          chunks: 'initial',
          minChunks: 2,
        },
      },
    })
    expect(config2.optimization!.splitChunks).toEqual({
      cacheGroups: {
        common: {
          name: 'shared',
          chunks: 'initial',
          minChunks: 2,
        },
      },
    })
  })

  it('should build with CSS loaders', () => {
    const cssLoaders: CSSLoader[] = [
      {test: /\.css$/, use: ['css-loader']},
      {test: /\.scss$/, use: ['css-loader', 'sass-loader']},
    ]
    const config1 = createConfiguration({cssLoaders})
    const config2 = createConfiguration({cssLoaders, hotReload: true})
    expect(config1.module.rules).toEqual([
      {
        exclude: /node_modules/,
        test: /\.[jt]sx?$/,
        use: [
          {
            loader: 'awesome-typescript-loader',
            options: {
              useBabel: false,
              useCache: false,
              transpileOnly: true,
              cacheDirectory: 'node_modules/.awcache',
              forceIsolatedModules: true,
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: ExtractTextPlugin.extract({
          use: ['css-loader'],
          fallback: 'style-loader',
        }),
      },
      {
        test: /\.scss$/,
        use: ExtractTextPlugin.extract({
          use: ['css-loader', 'sass-loader'],
          fallback: 'style-loader',
        }),
      },
    ])
    expect(config2.module.rules).toEqual([
      {
        exclude: /node_modules/,
        test: /\.[jt]sx?$/,
        use: [
          {
            loader: 'awesome-typescript-loader',
            options: {
              useBabel: false,
              useCache: true,
              transpileOnly: true,
              cacheDirectory: 'node_modules/.awcache',
              forceIsolatedModules: true,
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
    ])
    expect(config1.plugins).toHaveLength(3)
    expect(config2.plugins).toHaveLength(4)
  })

  it('should build with hot reload', () => {
    expect(createConfiguration({hotReload: true})).toEqual({
      ...expectedConfig,
      entry: {
        extra: ['webpack-hot-middleware/client', `.${sep}extra.ts`],
        index: ['webpack-hot-middleware/client', `.${sep}index.ts`],
      },
      module: {
        rules: [
          {
            exclude: /node_modules/,
            test: /\.[jt]sx?$/,
            use: [
              {
                loader: 'awesome-typescript-loader',
                options: {
                  useBabel: false,
                  useCache: true,
                  transpileOnly: true,
                  cacheDirectory: 'node_modules/.awcache',
                  forceIsolatedModules: true,
                },
              },
            ],
          },
        ],
      },
      optimization: {
        noEmitOnErrors: true,
      },
      plugins: [
        new DefinePlugin({
          'process.env.NODE_ENV': 'undefined',
          'process.env.IS_CLIENT': '"true"',
          'process.env.WEBPACK_BUILD': '"true"',
        }),
        new HardSourcePlugin(),
        new HotModuleReplacementPlugin(),
      ],
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

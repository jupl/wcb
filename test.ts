// @ts-ignore
import BabelMinifyPlugin from 'babel-minify-webpack-plugin'
import ExtractTextPlugin from 'extract-text-webpack-plugin'
import {sep} from 'path'
import {
  Configuration,
  DefinePlugin,
  HotModuleReplacementPlugin,
  Plugin,
} from 'webpack'
import {CSSLoader, addRules, createConfiguration} from '.'

// tslint:disable:no-duplicate-string no-magic-numbers

const expectedConfig: Configuration = {
  context: __dirname,
  entry: {
    extra: [`.${sep}extra.ts`],
    index: [`.${sep}index.ts`],
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
    filename: '[name].js',
    path: __dirname,
    publicPath: '/',
  },
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
const protocol = process.platform === 'win32' ? 'file:///' : 'file://'

describe('createConfig', () => { // tslint:disable-line:no-big-function
  let env: string | undefined

  beforeAll(() => {
    env = process.env.NODE_ENV
    delete process.env.NODE_ENV // tslint:disable-line:no-object-mutation
  })

  afterAll(() => {
    process.env.NODE_ENV = env // tslint:disable-line:no-object-mutation
  })

  it('should build with no environment', () => {
    expect(createConfiguration()).toEqual({
      ...expectedConfig,
      plugins: expectedPlugins,
    })
  })

  it('should build with development environment', () => {
    const {
      devtool,
      plugins,
      output: {devtoolModuleFilenameTemplate, ...output},
      ...config
    } = createConfiguration({environment: 'development'})
    const data = {absoluteResourcePath: `some${sep}path`}
    expect({...config, output}).toEqual(expectedConfig)
    expect(devtoolModuleFilenameTemplate).toBeInstanceOf(Function)
    expect((devtoolModuleFilenameTemplate as Function)(data))
      .toEqual(`${protocol}some/path`)
    expect(devtool).toEqual('inline-source-map')
    expect(plugins).toEqual([
      new DefinePlugin({
        'process.env.IS_CLIENT': '"true"',
        'process.env.NODE_ENV': '"development"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
    ])
  })

  it('should build with production environment', () => {
    const {plugins, ...config} = createConfiguration({
      environment: 'production',
    })
    expect(config).toEqual(expectedConfig)
    expect(plugins).toHaveLength(3)
    expect(plugins).toEqual(expect.arrayContaining([
      new DefinePlugin({
        'process.env.IS_CLIENT': '"true"',
        'process.env.NODE_ENV': '"production"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
      new (BabelMinifyPlugin as any)(), // tslint:disable-line:no-any
    ]))
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
              cacheDirectory: 'node_modules/.awcache',
              forceIsolatedModules: true,
              transpileOnly: true,
              useCache: false,
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: ['css-loader'],
        }),
      },
      {
        test: /\.scss$/,
        use: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: ['css-loader', 'sass-loader'],
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
    ])
    expect(config1.plugins).toHaveLength(2)
    expect(config2.plugins).toHaveLength(3)
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

import * as BabiliPlugin from 'babili-webpack-plugin'
import {sep} from 'path'
import {
  Configuration,
  DefinePlugin,
  HotModuleReplacementPlugin,
  NoEmitOnErrorsPlugin,
} from 'webpack'
import {addRules, createConfiguration} from '.'

// tslint:disable:no-magic-numbers

const expectedConfig: Configuration = {
  context: __dirname,
  entry: {
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

describe('createConfig', () => {
  let env

  beforeAll(() => {
    env = process.env.NODE_ENV
    delete process.env.NODE_ENV
  })

  afterAll(() => {
    process.env.NODE_ENV = env
  })

  it('should build with no environment', () => {
    expect(createConfiguration()).toEqual({...expectedConfig, plugins: [
      new DefinePlugin({
        'process.env.NODE_ENV': 'undefined',
        'process.env.IS_CLIENT': '"true"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
    ]})
  })

  it('should build with development environment', () => {
    expect(createConfiguration({environment: 'development'})).toEqual({
      ...expectedConfig,
      plugins: [
        new DefinePlugin({
          'process.env.NODE_ENV': '"development"',
          'process.env.IS_CLIENT': '"true"',
          'process.env.WEBPACK_BUILD': '"true"',
        }),
      ],
      devtool: 'inline-source-map',
    })
  })

  it('should build with production environment', () => {
    const {plugins, ...config} = createConfiguration({
      environment: 'production',
    })
    expect(config).toEqual(expectedConfig)
    expect(plugins).toHaveLength(3)
    expect(plugins).toEqual(expect.arrayContaining([
      new DefinePlugin({
        'process.env.NODE_ENV': '"production"',
        'process.env.IS_CLIENT': '"true"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
      new BabiliPlugin(),
    ]))
  })

  it('should build with assets', () => {
    const {plugins, ...config} = createConfiguration({assets: ''})
    expect(config).toEqual(expectedConfig)
    expect(plugins).toHaveLength(2)
    expect(plugins).toEqual(expect.arrayContaining([
      new DefinePlugin({
        'process.env.NODE_ENV': 'undefined',
        'process.env.IS_CLIENT': '"true"',
        'process.env.WEBPACK_BUILD': '"true"',
      }),
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

  it('should build with hot reload', () => {
    expect(createConfiguration({hotReload: true})).toEqual({
      ...expectedConfig,
      entry: {
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
                },
              },
            ],
          },
        ],
      },
      plugins: [
        new DefinePlugin({
          'process.env.NODE_ENV': 'undefined',
          'process.env.IS_CLIENT': '"true"',
          'process.env.WEBPACK_BUILD': '"true"',
        }),
        new HotModuleReplacementPlugin(),
        new NoEmitOnErrorsPlugin(),
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

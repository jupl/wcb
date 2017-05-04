import * as BabiliPlugin from 'babili-webpack-plugin'
import {
  BannerPlugin,
  Configuration,
  DefinePlugin,
  HotModuleReplacementPlugin,
  NoEmitOnErrorsPlugin,
} from 'webpack'
import {createConfig} from '.'

const expectedConfig: Configuration = {
  context: __dirname,
  entry: {
    assets: ['./assets.ts'],
    base: ['./base.ts'],
    development: ['./development.ts'],
    hot: ['./hot.ts'],
    index: ['./index.ts'],
    node: ['./node.ts'],
    production: ['./production.ts'],
    util: ['./util.ts'],
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
  plugins: [
    new DefinePlugin({
      'process.env.NODE_ENV': 'null',
      'process.env.IS_CLIENT': '"true"',
    }),
  ],
  resolve: {
    extensions: ['.js', '.json', '.jsx', '.ts', '.tsx'],
  },
  target: 'web',
}

test('Build with no environment', () => {
  expect(createConfig()).toEqual(expectedConfig)
})

test('Build with logging', () => {
  expect(createConfig({log: true})).toEqual(expectedConfig)
})

test('Build with development environment', () => {
  expect(createConfig({environment: 'development'})).toEqual({
    ...expectedConfig,
    devtool: 'inline-source-map',
  })
})

test('Build with production environment', () => {
  const {
    plugins: [definePlugin, ...plugins],
    ...config,
  } = createConfig({environment: 'production'})
  expect({...config, plugins: [definePlugin]}).toEqual(expectedConfig)
  expect(plugins).toHaveLength(2)
  expect(plugins[1]).toEqual(new BabiliPlugin())
})

test('Build with assets', () => {
  const {
    plugins: [definePlugin, ...plugins],
    ...config,
  } = createConfig({assets: ''})
  expect({...config, plugins: [definePlugin]}).toEqual(expectedConfig)
  expect(plugins).toHaveLength(1)
})

test('Build with invalid assets', () => {
  expect(createConfig({assets: 'path/to/assets'})).toEqual(expectedConfig)
})

test('Build with node', () => {
  const {externals, ...config} = createConfig({target: 'node'})
  expect(config).toEqual({
    ...expectedConfig,
    plugins: [
      new DefinePlugin({
        'process.env.NODE_ENV': 'null',
        'process.env.IS_CLIENT': '"false"',
      }),
      new BannerPlugin({
        banner: '#!/usr/bin/env node',
        entryOnly: true,
        raw: true,
      }),
    ],
    target: 'node',
  })
  expect(externals).toHaveLength(1)
})

test('Build with node and dotenv', () => {
  const {
    externals,
    ...config,
  } = createConfig({target: 'node', useDotEnv: true})
  expect(config).toEqual({
    ...expectedConfig,
    entry: {
      assets: ['dotenv/config', './assets.ts'],
      base: ['dotenv/config', './base.ts'],
      development: ['dotenv/config', './development.ts'],
      hot: ['dotenv/config', './hot.ts'],
      index: ['dotenv/config', './index.ts'],
      node: ['dotenv/config', './node.ts'],
      production: ['dotenv/config', './production.ts'],
      util: ['dotenv/config', './util.ts'],
    },
    plugins: [
      new DefinePlugin({
        'process.env.NODE_ENV': 'null',
        'process.env.IS_CLIENT': '"false"',
      }),
      new BannerPlugin({
        banner: '#!/usr/bin/env node',
        entryOnly: true,
        raw: true,
      }),
    ],
    target: 'node',
  })
  expect(externals).toHaveLength(1)
})

test('Build with hot reload', () => {
  expect(createConfig({hotReload: true})).toEqual({
    ...expectedConfig,
    entry: {
      assets: ['webpack-hot-middleware/client', './assets.ts'],
      base: ['webpack-hot-middleware/client', './base.ts'],
      development: ['webpack-hot-middleware/client', './development.ts'],
      hot: ['webpack-hot-middleware/client', './hot.ts'],
      index: ['webpack-hot-middleware/client', './index.ts'],
      node: ['webpack-hot-middleware/client', './node.ts'],
      production: ['webpack-hot-middleware/client', './production.ts'],
      util: ['webpack-hot-middleware/client', './util.ts'],
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
      ...expectedConfig.plugins,
      new HotModuleReplacementPlugin(),
      new NoEmitOnErrorsPlugin(),
    ],
  })
})

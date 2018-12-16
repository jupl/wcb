import {sep} from 'path'
import {DefinePlugin, Plugin} from 'webpack'
import {CSSLoader, Configuration} from './src/types'

/** Additional CSS loaders */
export const cssLoaders: CSSLoader[] = [
  {test: /\.css$/, use: ['css-loader']},
  {test: /\.scss$/, use: ['css-loader', 'sass-loader']},
]

/** Webpack dev server options */
export const devServer: Configuration['devServer'] = {
  stats: {all: false, builtAt: true, errors: true},
}

/** Expected base configuration */
export const expectedConfig: Configuration = {
  context: __dirname,
  devtool: 'source-map',
  entry: {
    extra: [`.${sep}extra.ts`],
    fixtures: [`.${sep}fixtures.ts`],
    'src/index': [`.${sep}src${sep}index.ts`],
    'src/types': [`.${sep}src${sep}types.ts`],
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
  },
  plugins: undefined!,
  resolve: {
    extensions: ['.js', '.json', '.jsx', '.ts', '.tsx'],
    plugins: [],
  },
  target: 'web',
}

/** Expected plugins */
export const expectedPlugins: Plugin[] = [
  new DefinePlugin({
    'process.env.IS_CLIENT': '"true"',
    'process.env.WEBPACK_BUILD': '"true"',
  }),
]

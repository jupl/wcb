import {find} from 'globule'
import * as path from 'path'
import {Configuration, DefinePlugin, Entry} from 'webpack'
import {isNodeTarget} from './util'

// Patterns to ignore in entries
const ignoreGlobs = [
  '!**/node_modules/**',
  '!**/*.d.ts',
  '!**/__tests__/**',
  '!**/{,*.}{test,spec}.*',
]

/** Options for base build */
interface Options {
  destination: string
  environment?: string
  pattern: string[]
  source: string
  target: string
  useBabel: boolean
  useCache: boolean
}

/**
 * Build base Webpack configuration with defaults that can be expanded upon
 * @property source Source path to read source code from
 * @property destination Destination path to write assets out
 * @property useCache If true then use cache for TypeScript loader
 * @return Webpack configuration
 */
export function createBase({
  destination,
  environment,
  pattern,
  source,
  target,
  useBabel,
  useCache,
}: Options): Configuration {
  return {
    entry: entries(source, pattern),
    module: {
      rules: [
        {
          test: /\.[jt]sx?$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'awesome-typescript-loader',
              options: {useBabel, useCache},
            },
          ],
        },
      ],
    },
    output: {
      path: destination,
      filename: '[name].js',
      publicPath: '/',
    },
    plugins: [
      new DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(environment) || 'null',
        'process.env.IS_CLIENT': JSON.stringify(String(!isNodeTarget(target))),
      }),
    ],
    resolve: {
      extensions: [
        '.js',
        '.json',
        '.jsx',
        '.ts',
        '.tsx',
      ],
    },
    target,
  }
}

/**
 * Build entries configuration for Webpack based on our app structure by
 * looking for all top-level JS files in source to compile
 * @param source Source directory
 * @param pattern Glob pattern to search by
 * @return Entries configuration for Webpack
 */
function entries(source: string, pattern: string[]) {
  return find([...pattern, ...ignoreGlobs], {srcBase: source})
    .map(file => ({
      file,
      base: path.basename(file, path.extname(file)),
      dir: path.dirname(path.relative(path.resolve(source), file)),
    }))
    .reduce((obj, {base, dir, file}) => ({
      ...obj,
      [path.join(dir, base)]: [file],
    }), {} as Entry)
}

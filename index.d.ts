import {Configuration} from 'webpack'

export interface Options {
  assets?: string
  assetsIgnore?: string[]
  destination?: string
  environment?: string
  hotReload?: boolean
  log?: boolean
  pattern?: string[]
  source?: string
  target?: string
  useBabel?: boolean
  useDotEnv?: boolean
}

export function createConfig(options: Options): Configuration

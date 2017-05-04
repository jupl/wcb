import {addAssets} from './assets'
import {createBase} from './base'
import {addDevelopment} from './development'
import {addHot} from './hot'
import {addNode} from './node'
import {addProduction} from './production'
import {isNodeTarget} from './util'

/** Options for webpack build */
export interface Options {
  /** Path that contains static assets (default is no static assets) */
  assets?: string

  /** Asset files to ignore when copying (default is pattern parameter) */
  assetsIgnore?: string[]

  /** Path to write output to (defaults to working path) */
  destination?: string

  /** Environment to run under (defaults to NODE_ENV) */
  environment?: string

  /** If true then hot reload (defaults to HOT_RELOAD === 'true') */
  hotReload?: boolean

  /** Log to console (defaults to false) */
  log?: boolean

  /** Glob patterns to match (defaults to all TS files recursively) */
  pattern?: string[]

  /** Path that contains source files (defaults to working path) */
  source?: string

  /** Webpack target (defaults to web) */
  target?: string

  /** If true then use Babel (defaults to false) */
  useBabel?: boolean

  /** If true then load dotenv for Node (defaults to false) */
  useDotEnv?: boolean
}

/**
 * Build Webpack configuration
 * @param options Options
 * @return Webpack configuration
 */
export function createConfig({
  assets,
  destination = '',
  environment = process.env.NODE_ENV,
  hotReload = process.env.HOT_MODULES === 'true',
  log: canLog,
  pattern = ['**/*.ts{,x}'],
  assetsIgnore: ignore = pattern,
  source = '',
  target = 'web',
  useBabel = false,
  useDotEnv = false,
}: Options = {}) {
  // Create base configuration
  const nodeTarget = isNodeTarget(target)
  let config = createBase({
    destination,
    pattern,
    source,
    target,
    useBabel,
    useCache: hotReload,
  })
  log('making base configuration')

  // Add to configuration based on environment
  switch(environment) {
  case 'development':
    config = addDevelopment(config)
    log('adding development configuration')
    break
  case 'production':
    config = addProduction(config)
    log('adding production configuration')
    break
  default:
    break
  }

  // Include assets if specified
  if(assets || assets === '') {
    config = addAssets(config, {assets, ignore})
    log('adding assets configuration')
  }

  // Set up Node specifics if applicable
  if(nodeTarget) {
    config = addNode(config, {useDotEnv})
    log('adding node configuration')
  }

  // Add hot reload support if explicitly specified
  if(hotReload) {
    config = addHot(config)
    log('adding hot modules configuration')
  }

  return config

  function log(message: string) {
    if(canLog) {
      console.info(`--- wcb: ${message}`)
    }
  }
}

// Targets for node environment
const nodeTargets = [
  'async-node',
  'atom',
  'electron',
  'electron-main',
  'electron-renderer',
  'node',
  'node-webkit',
]

/**
 * Check if a Webpack target is Node related
 * @param target Webpack target
 * @return true if webpack is a Node related target
 */
export function isNodeTarget(target: string) {
  return nodeTargets.indexOf(target) !== -1
}

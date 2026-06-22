// Auto-generated napi-rs loader
const { existsSync } = require('fs')
const { join } = require('path')

const { platform, arch } = process

let nativeBinding = null
let localFileExisted = false
let loadError = ''

function loadBinding() {
  const name = `index.${platform}-${arch}.node`
  const localPath = join(__dirname, name)

  if (existsSync(localPath)) {
    localFileExisted = true
    return require(localPath)
  }

  throw new Error(
    `Failed to load native binding: ${name} not found in ${__dirname}. ` +
    `Searched: ${localPath}. ` +
    `Build the native module under native/ or unset ANDY_USE_NATIVE`
  )
}

try {
  nativeBinding = loadBinding()
} catch (e) {
  loadError = e.message
}

if (!nativeBinding) {
  throw new Error(
    `[andy-engine] Failed to load andy-core native module for ${platform}/${arch}.\n` +
    `${loadError}\n` +
    `If you set ANDY_USE_NATIVE=1, a compiled native binding is required. ` +
    `Build native/ or unset ANDY_USE_NATIVE to use the JS implementation.`
  )
}

module.exports = nativeBinding

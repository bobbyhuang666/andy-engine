// Auto-generated napi-rs loader
const { existsSync, readFileSync } = require('fs')
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

  throw new Error(`Failed to load native binding: ${name} not found in ${__dirname}`)
}

try {
  nativeBinding = loadBinding()
} catch (e) {
  loadError = e.message
}

if (!nativeBinding) {
  throw new Error(`Failed to load andy-core native module.\n${loadError}`)
}

module.exports = nativeBinding

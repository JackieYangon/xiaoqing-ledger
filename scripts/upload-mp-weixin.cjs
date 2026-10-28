const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')
const { randomUUID } = require('node:crypto')
const wrappedTextHeader = Buffer.from('%TSD-Header-###%', 'ascii')

function parseArgs(args) {
  const options = { cli: process.env.XQ_WECHAT_CLI || '', prepareOnly: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prepare-only') options.prepareOnly = true
    else if (args[i] === '--cli' || args[i] === '--desc') {
      const key = args[i].slice(2)
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Missing value for --${key}`)
      options[key] = args[++i]
    } else throw Error(`Unknown argument: ${args[i]}`)
  }
  if (!options.prepareOnly && !options.cli) throw Error('Set XQ_WECHAT_CLI or pass --cli with the developer tools CLI path')
  return options
}

// Batch files expand shell syntax even when called from Node. Keep every argument
// quoted and reject expansion/control characters instead of accepting shell text.
function batchCommand(cli, args) {
  const values = [cli, ...args]
  if (values.some(value => /["%!^&|<>\r\n]/.test(value)))
    throw Error('CLI paths and arguments cannot contain shell control characters')
  return '"' + values.map(value => '"' + value + '"').join(' ') + '"'
}

function redactCliOutput(output) {
  return String(output || '').replace(/\bwx[0-9a-f]{16}\b/gi, '[AppID hidden]')
}

function run(command, args, options = {}) {
  const { capture = false, ...spawnOptions } = options
  const isBatch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command)
  const result = isBatch
    ? cp.spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', batchCommand(command, args)], {
        ...spawnOptions, windowsVerbatimArguments: true, windowsHide: true, encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit', maxBuffer: 8 * 1024 * 1024,
      })
    : cp.spawnSync(command, args, {
        ...spawnOptions, windowsHide: true, encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit', maxBuffer: 8 * 1024 * 1024,
      })
  if (capture) {
    if (result.stdout) process.stdout.write(redactCliOutput(result.stdout))
    if (result.stderr) process.stderr.write(redactCliOutput(result.stderr))
  }
  if (result.error) throw result.error
  if (result.status !== 0) throw Error(`Command failed with exit code ${result.status}`)
  return String(result.stdout || '') + '\n' + String(result.stderr || '')
}

function verifyUpload(output, receiptPath) {
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '')
  if (!/(?:√|✔)\s+upload(?:\s+success)?(?:\r?\n|$)/.test(plain))
    throw Error('Upload was not confirmed by the developer tools CLI')
  if (!fs.existsSync(receiptPath)) throw Error('Upload did not produce a fresh receipt')
  const info = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
  if (!Number.isSafeInteger(info.size?.total) || info.size.total <= 0)
    throw Error('Upload receipt has no valid package size')
  return info
}

function copyProductionFiles(source, destination) {
  fs.mkdirSync(destination)
  for (const item of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, item.name)
    const to = path.join(destination, item.name)
    if (item.isDirectory()) copyProductionFiles(from, to)
    else if (item.isFile()) {
      // Read and write the visible bytes. Native copy operations can preserve
      // filesystem wrappers that the developer tools cannot read as source.
      const contents = fs.readFileSync(from)
      const isSource = /\.(?:js|json|wxml|wxss|wxs)$/i.test(item.name)
      if (isSource && contents.subarray(0, wrappedTextHeader.length).equals(wrappedTextHeader))
        throw Error(`Cannot upload wrapped build text: ${item.name}`)
      fs.writeFileSync(to, contents, { flag: 'wx' })
      const copied = fs.readFileSync(to)
      if (isSource && copied.subarray(0, wrappedTextHeader.length).equals(wrappedTextHeader))
        throw Error(`Copied build text is wrapped: ${item.name}`)
      if (!copied.equals(contents)) throw Error(`Copied build file differs from production: ${item.name}`)
    } else throw Error(`Unsupported file type in production build: ${item.name}`)
  }
}

function prepareAndUpload(options, execute = run) {
  const root = options.root || path.resolve(__dirname, '..')
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) throw Error('Invalid package version')
  const cli = options.cli ? path.resolve(options.cli) : ''
  if (!options.prepareOnly && (!cli || !fs.existsSync(cli))) throw Error('Developer tools CLI was not found')
  const desc = options.desc || `Xiaoqing Ledger ${pkg.version}: refresh mini-program version and build`
  const uploadBase = path.join(root, 'work', 'wechat-release')
  fs.mkdirSync(uploadBase, { recursive: true })
  const uploadDir = fs.mkdtempSync(path.join(uploadBase, 'project-'))
  const receipt = path.join(uploadDir, 'upload-' + randomUUID() + '.json')
  const args = ['upload', '--project', uploadDir, '--version', pkg.version, '--desc', desc, '--info-output', receipt]
  if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(cli)) batchCommand(cli, args)
  const productionDir = path.join(root, 'dist', 'build', 'mp-weixin')
  const buildEnv = { ...process.env, UNI_INPUT_DIR: path.join(root, 'src'), UNI_OUTPUT_DIR: productionDir }

  // Rebuild on every upload. Neither a successful old receipt nor an existing
  // output directory can skip this step, even if the version has not changed.
  for (const task of [
    ['scripts/prepare-local-config.cjs'],
    ['node_modules/@dcloudio/vite-plugin-uni/bin/uni.js', 'build', '-p', 'mp-weixin'],
    ['scripts/check-mp-quality.cjs'],
  ]) execute(process.execPath, task, { cwd: root, env: buildEnv })

  const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
  if (!options.prepareOnly && !/^wx[0-9a-f]{16}$/.test(project.appid))
    throw Error('A configured mini-program AppID is required for upload')
  if (!fs.existsSync(path.join(productionDir, 'app.json')))
    throw Error('Production build did not produce app.json')
  // The developer tools do not allow miniprogramRoot to escape the project.
  // Copy into a new project directory for every attempt to exclude stale files.
  copyProductionFiles(productionDir, path.join(uploadDir, 'miniprogram'))
  project.miniprogramRoot = 'miniprogram/'
  delete project.cloudfunctionRoot
  fs.writeFileSync(path.join(uploadDir, 'project.config.json'), JSON.stringify(project, null, 2) + '\n')
  if (options.prepareOnly) {
    console.log(`Prepared production upload project for version ${pkg.version}: ${path.relative(root, uploadDir)}; nothing uploaded.`)
    return { version: pkg.version, project: uploadDir, uploaded: false }
  }
  const output = execute(cli, args, { cwd: root, capture: true })
  const info = verifyUpload(output, receipt)
  console.log(`Uploaded mini-program ${pkg.version} (${info.size.total} bytes). Receipt: ${path.relative(root, receipt)}`)
  console.log('Check the uploaded version in the mini-program console and select it as the experience version.')
  return { version: pkg.version, project: uploadDir, receipt, uploaded: true }
}

if (require.main === module) {
  try { prepareAndUpload(parseArgs(process.argv.slice(2))) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { parseArgs, batchCommand, redactCliOutput, verifyUpload, copyProductionFiles, prepareAndUpload }

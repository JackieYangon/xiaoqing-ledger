const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const cp = require('node:child_process')
const { batchCommand, redactCliOutput, verifyUpload, prepareAndUpload } = require('../scripts/upload-mp-weixin.cjs')

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaoqing-upload-'))
try {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  fs.writeFileSync(path.join(root, 'project.config.json'), JSON.stringify({
    appid: 'wx0000000000000000', miniprogramRoot: 'dist/dev/mp-weixin/', cloudfunctionRoot: 'cloudfunctions/',
  }))
  const cli = path.join(root, 'cli.exe')
  fs.writeFileSync(cli, '')
  const productionDir = path.join(root, 'dist/build/mp-weixin')
  fs.mkdirSync(path.join(productionDir, 'pages/about'), { recursive: true })
  fs.writeFileSync(path.join(productionDir, 'app.json'), '{"pages":["pages/about/index"]}\n')
  fs.writeFileSync(path.join(productionDir, 'pages/about/index.js'), 'current version')
  const asset = Buffer.from([0, 1, 2, 0xff, 0x80, 0x7f])
  fs.writeFileSync(path.join(productionDir, 'asset.png'), asset)
  const calls = []
  const strictConfigArgs = ['scripts/prepare-local-config.cjs', '--mp-mode', 'build', '--require-cloud']
  const uploadBase = path.join(root, 'work/wechat-release')
  const originalFiles = new Map([
    ['project.config.json', fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')],
    ['src/manifest.json', 'existing manifest'],
    ['src/config/cloud.local.ts', 'existing cloud configuration'],
    ['cloudfunctions/ledger/local-config.json', 'existing cloud function configuration'],
    ['dist/build/mp-weixin/pages/about/index.js', 'current version'],
  ])
  for (const [file, contents] of originalFiles) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), contents)
  }
  fs.writeFileSync(path.join(root, '.env.local'), 'XQ_CLOUD_ENV=\n')
  const prepareScript = path.resolve(__dirname, '../scripts/prepare-local-config.cjs')
  for (const prepareOnly of [false, true]) {
    calls.length = 0
    assert.throws(() => prepareAndUpload({ root, cli, prepareOnly }, (command, args, options) => {
      calls.push(args)
      assert.deepEqual(args, strictConfigArgs, 'configuration must be checked before the build or upload')
      const result = cp.spawnSync(command, [prepareScript, ...args.slice(1)], {
        cwd: options.cwd,
        env: { ...options.env, XQ_APP_ID: 'wx0000000000000000', XQ_CLOUD_ENV: '' },
        encoding: 'utf8', windowsHide: true,
      })
      if (result.error) throw result.error
      assert.notEqual(result.status, 0, 'missing cloud configuration must fail the real preflight')
      throw Error(result.stderr)
    }), /XQ_CLOUD_ENV is required/)
    assert.deepEqual(calls, [strictConfigArgs], 'failed preflight must prevent build, quality checks, and upload')
    assert.equal(fs.existsSync(uploadBase), false, 'failed preflight must not create an upload directory')
    for (const [file, contents] of originalFiles)
      assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), contents, `failed preflight preserves ${file}`)
  }
  calls.length = 0
  const execute = (command, args, options) => {
    calls.push(args)
    if (command === cli) {
      const uploadProject = args[args.indexOf('--project') + 1]
      assert.equal(fs.existsSync(path.join(uploadProject, 'miniprogram/app.json')), true)
      const receipt = args[args.indexOf('--info-output') + 1]
      assert.equal(fs.existsSync(receipt), false, 'each attempt must use a fresh receipt')
      fs.writeFileSync(receipt, JSON.stringify({ size: { total: 123456 } }))
      return '√ upload\n'
    }
    assert.equal(options.env.UNI_INPUT_DIR, path.join(root, 'src'))
    assert.equal(options.env.UNI_OUTPUT_DIR, productionDir)
    return ''
  }
  const result = prepareAndUpload({ root, cli }, execute)
  assert.equal(result.uploaded, true)
  assert.deepEqual(calls.slice(0, 3), [
    strictConfigArgs,
    ['node_modules/@dcloudio/vite-plugin-uni/bin/uni.js', 'build', '-p', 'mp-weixin'],
    ['scripts/check-mp-quality.cjs'],
  ])
  assert.equal(calls[3][calls[3].indexOf('--version') + 1], '1.2.3')
  const project = JSON.parse(fs.readFileSync(path.join(result.project, 'project.config.json'), 'utf8'))
  assert.equal(project.miniprogramRoot, 'miniprogram/')
  assert.equal(project.cloudfunctionRoot, undefined)
  assert.equal(fs.readFileSync(path.join(result.project, 'miniprogram/pages/about/index.js'), 'utf8'), 'current version')
  assert.deepEqual(fs.readFileSync(path.join(result.project, 'miniprogram/asset.png')), asset)
  fs.writeFileSync(path.join(result.project, 'miniprogram/stale.js'), 'old uploaded file')
  calls.length = 0
  const repeated = prepareAndUpload({ root, cli }, execute)
  assert.equal(calls.length, 4, 'same-version uploads must also rebuild')
  assert.notEqual(repeated.project, result.project, 'every upload must use a new project directory')
  assert.equal(fs.existsSync(path.join(repeated.project, 'miniprogram/stale.js')), false)
  calls.length = 0
  const prepared = prepareAndUpload({ root, prepareOnly: true }, execute)
  assert.equal(prepared.uploaded, false)
  assert.equal(fs.existsSync(path.join(prepared.project, 'miniprogram/app.json')), true)
  assert.equal(calls.length, 3, 'prepare-only must not upload')
  calls.length = 0
  assert.throws(() => prepareAndUpload({ root, cli }, (command, args) => {
    calls.push(args)
    if (args[0].includes('uni.js')) throw Error('compile failed')
  }), /compile failed/)
  assert.equal(calls.length, 2, 'failed builds must prevent upload')
  assert.throws(() => verifyUpload('error: upload failed\n', result.receipt), /not confirmed/)
  assert.throws(() => verifyUpload('√ upload\n', path.join(root, 'missing.json')), /fresh receipt/)
  fs.writeFileSync(result.receipt, JSON.stringify({ size: { total: 0 } }))
  assert.throws(() => verifyUpload('√ upload\n', result.receipt), /valid package size/)
  assert.equal(redactCliOutput('appid: wx0123456789abcdef\nupload failed'), 'appid: [AppID hidden]\nupload failed')
  assert.equal(batchCommand('D:\\App Tools\\cli.bat', ['--desc', 'refresh version']), '""D:\\App Tools\\cli.bat" "--desc" "refresh version""')
  for (const unsafe of ['a&b', '%PATH%', 'a"b', 'a\nb', '!value!', 'a|b'])
    assert.throws(() => batchCommand('cli.bat', ['--desc', unsafe]), /shell control/)
  if (process.platform === 'win32') {
    const batchPath = path.join(root, 'safe arguments.cmd')
    fs.writeFileSync(batchPath, '@echo off\r\necho [%~1]\r\necho [%~2]\r\n')
    const batch = cp.spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', batchCommand(batchPath, ['--desc', 'refresh version'])], {
      encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true,
    })
    assert.equal(batch.status, 0)
    assert.equal(batch.stdout.trim(), '[--desc]\r\n[refresh version]')
  }
  calls.length = 0
  fs.writeFileSync(path.join(productionDir, 'pages/about/index.js'), '%TSD-Header-###%unreadable wrapped text')
  assert.throws(() => prepareAndUpload({ root, cli }, execute), /Cannot upload wrapped build text/)
  assert.equal(calls.length, 3, 'wrapped text must prevent the CLI upload')
  fs.writeFileSync(path.join(productionDir, 'pages/about/index.js'), 'current version')
  fs.unlinkSync(path.join(productionDir, 'app.json'))
  assert.throws(() => prepareAndUpload({ root, cli }, execute), /did not produce app.json/)
  console.log('PASS mini-program upload: deployment preflight, mandatory rebuild, verified byte copies, fresh production project, confirmed receipt, safe batch arguments')
} finally {
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()))
  assert.ok(path.basename(root).startsWith('xiaoqing-upload-'))
  fs.rmSync(root, { recursive: true, force: true })
}

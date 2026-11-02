const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const prepare = fs.readFileSync('scripts/prepare-local-config.cjs', 'utf8')
const projectTemplate = JSON.parse(fs.readFileSync('project.config.template.json', 'utf8'))
const manifestTemplate = JSON.parse(fs.readFileSync('src/manifest.template.json', 'utf8'))
function generate(version, options = {}) {
  const files = new Map([
    ['package.json', JSON.stringify({ version })],
    ['src/manifest.template.json', JSON.stringify({
      ...manifestTemplate, versionName: '0.5.0', versionCode: '50',
    })],
    ['project.config.template.json', JSON.stringify(projectTemplate)],
  ])
  if (options.existingProject)
    files.set('project.config.json', JSON.stringify(options.existingProject))
  if (options.localEnv !== undefined) files.set('.env.local', options.localEnv)
  for (const [file, contents] of Object.entries(options.files || {})) files.set(file, contents)
  const writes = []
  const fixtureFs = {
    existsSync: (file) => files.has(file),
    readFileSync: (file) => {
      assert.ok(files.has(file), `unexpected read: ${file}`)
      return files.get(file)
    },
    writeFileSync: (file, content) => {
      writes.push(file)
      files.set(file, content)
    },
  }
  const run = ({ args = options.args || [], env = options.env || {} } = {}) => vm.runInNewContext(prepare, {
    require: (name) => {
      assert.equal(name, 'node:fs')
      return fixtureFs
    },
    process: { env, argv: ['node', 'scripts/prepare-local-config.cjs', ...args] },
    console: { log() {} },
  })
  return { files, writes, run }
}

function config(fixture, file = 'project.config.json') {
  return JSON.parse(fixture.files.get(file))
}
function assertAppId(fixture, appid) {
  assert.equal(config(fixture).appid, appid || 'touristappid')
  assert.equal(config(fixture, 'src/manifest.json')['mp-weixin'].appid, appid)
  assert.equal(config(fixture, 'cloudfunctions/ledger/local-config.json').appid, appid)
}
function assertNoWrites(fixture, expectedError) {
  const original = [...fixture.files]
  assert.throws(fixture.run, expectedError)
  assert.deepEqual(fixture.writes, [], 'invalid input fails before writing any local configuration')
  assert.deepEqual([...fixture.files], original, 'invalid input preserves every original file')
}

for (const [version, code] of [['1.0.2', '10002'], ['1.10.0', '11000'], ['2.0.0', '20000'], ['1.0.2-r1', '10002']]) {
  const fixture = generate(version)
  fixture.run()
  const manifest = JSON.parse(fixture.files.get('src/manifest.json'))
  assert.equal(manifest.versionName, version, 'package version replaces a stale template version')
  assert.equal(manifest.versionCode, code, 'numeric version stays ordered across minor and major releases')
}
for (const version of ['bad', '1.100.0', '1.0.100']) {
  const fixture = generate(version)
  assert.throws(fixture.run, /version/)
  assert.deepEqual(fixture.writes, [], 'invalid version fails before rewriting local configuration')
}

const fresh = generate('1.0.3')
fresh.run()
assert.equal(config(fresh).miniprogramRoot, 'dist/dev/mp-weixin/')
assert.equal(config(fresh).cloudfunctionRoot, 'cloudfunctions/')
assertAppId(fresh, '')

const existingAppId = 'wx1111111111111111'
const localAppId = 'wx2222222222222222'
const processAppId = 'wx3333333333333333'
const repaired = generate('1.0.3', { existingProject: { appid: existingAppId } })
repaired.run()
assert.equal(config(repaired).miniprogramRoot, 'dist/dev/mp-weixin/', 'setup repairs a missing source root')
assertAppId(repaired, existingAppId)

const modes = generate('1.0.3', { existingProject: { appid: existingAppId } })
modes.run({ args: ['--mp-mode', 'build'] })
assert.equal(config(modes).miniprogramRoot, 'dist/build/mp-weixin/')
const buildWrites = modes.writes.length
modes.run()
assert.equal(config(modes).miniprogramRoot, 'dist/build/mp-weixin/', 'ordinary setup keeps the production target')
assert.equal(modes.writes.length, buildWrites, 'unchanged setup does not rewrite generated files')
modes.run({ args: ['--mp-mode', 'dev'] })
assert.equal(config(modes).miniprogramRoot, 'dist/dev/mp-weixin/', 'development explicitly replaces the production target')
const devWrites = modes.writes.length
modes.run({ args: ['--mp-mode', 'dev'] })
assert.equal(modes.writes.length, devWrites, 'repeating an explicit mode is also idempotent')
assertAppId(modes, existingAppId)

for (const miniprogramRoot of ['dist/dev/mp-weixin/', 'dist/build/mp-weixin/', 'src/', '../other/']) {
  const fixture = generate('1.0.3', { existingProject: { appid: 'touristappid', miniprogramRoot } })
  fixture.run()
  assert.equal(config(fixture).miniprogramRoot,
    miniprogramRoot === 'dist/build/mp-weixin/' ? miniprogramRoot : projectTemplate.miniprogramRoot,
    'only known build targets survive ordinary setup')
  assertAppId(fixture, '')
}

const local = generate('1.0.3', {
  existingProject: { appid: existingAppId },
  localEnv: `XQ_APP_ID='${localAppId}'\nXQ_CLOUD_ENV=local-cloud\n`,
})
local.run()
assertAppId(local, localAppId)
local.run({ env: { XQ_APP_ID: processAppId } })
assertAppId(local, processAppId)
local.run({ env: { XQ_APP_ID: '' } })
assertAppId(local, '')

const cleared = generate('1.0.3', {
  existingProject: { appid: existingAppId }, localEnv: 'XQ_APP_ID=\n',
})
cleared.run()
assertAppId(cleared, '')
const unrelatedEnv = generate('1.0.3', {
  existingProject: { appid: existingAppId }, localEnv: 'XQ_CLOUD_ENV=local-cloud\n',
})
unrelatedEnv.run()
assertAppId(unrelatedEnv, existingAppId)

const guestBuild = generate('1.0.4', { args: ['--mp-mode', 'build'] })
guestBuild.run()
assert.equal(config(guestBuild).miniprogramRoot, 'dist/build/mp-weixin/')
assertAppId(guestBuild, '')
assert.match(guestBuild.files.get('src/config/cloud.local.ts'), /CLOUD_ENV = ""/,
  'ordinary production builds remain available for guest previews')

const strictArgs = ['--mp-mode', 'build', '--require-cloud']
const ready = generate('1.0.4', {
  args: strictArgs,
  existingProject: { appid: existingAppId },
  localEnv: 'XQ_CLOUD_ENV=local-cloud\n',
})
ready.run()
assertAppId(ready, existingAppId)
assert.equal(config(ready).miniprogramRoot, 'dist/build/mp-weixin/')
assert.match(ready.files.get('src/config/cloud.local.ts'), /CLOUD_ENV = "local-cloud"/)
ready.run({ args: ['--require-cloud', '--mp-mode', 'build'], env: { XQ_CLOUD_ENV: 'process-cloud' } })
assert.match(ready.files.get('src/config/cloud.local.ts'), /CLOUD_ENV = "process-cloud"/,
  'an explicit process environment takes precedence over the local file')

const preservedFiles = {
  'src/manifest.json': 'original manifest',
  'src/config/cloud.local.ts': 'original cloud configuration',
  'cloudfunctions/ledger/local-config.json': 'original cloud function configuration',
}
for (const [options, error] of [
  [{ existingProject: { appid: 'touristappid' } }, /AppID is required/],
  [{}, /XQ_CLOUD_ENV is required/],
  [{ localEnv: 'XQ_CLOUD_ENV=\n' }, /XQ_CLOUD_ENV is required/],
  [{ localEnv: 'XQ_APP_ID=\nXQ_CLOUD_ENV=local-cloud\n' }, /AppID is required/],
  [{ env: { XQ_APP_ID: '', XQ_CLOUD_ENV: 'process-cloud' } }, /AppID is required/],
  [{ env: { XQ_CLOUD_ENV: 'invalid cloud' } }, /Invalid XQ_CLOUD_ENV/],
]) {
  assertNoWrites(generate('1.0.4', {
    args: strictArgs,
    existingProject: { appid: existingAppId, miniprogramRoot: 'dist/dev/mp-weixin/', keep: true },
    files: preservedFiles,
    ...options,
  }), error)
}

for (const args of [
  ['--mp-mode'], ['--mp-mode', 'invalid'], ['--other'], ['--mp-mode', 'dev', 'extra'],
  ['--require-cloud', '--require-cloud'], ['--mp-mode', 'dev', '--mp-mode', 'build'],
  ['--require-cloud', '--mp-mode'],
])
  assertNoWrites(generate('1.0.3', { args }))
for (const options of [
  { env: { XQ_APP_ID: 'invalid' } },
  { localEnv: 'XQ_APP_ID=invalid\n' },
  { existingProject: { appid: 'invalid' } },
  { env: { XQ_CLOUD_ENV: 'invalid cloud' } },
  { files: { 'project.config.json': '{' } },
  { files: { 'project.config.template.json': '{' } },
  { files: { 'src/manifest.template.json': '{' } },
]) assertNoWrites(generate('1.0.3', options))

const versionModule = ts.transpileModule(fs.readFileSync('src/config/version.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
for (const version of ['1.0.2', '1.0.3']) {
  const exports = {}
  vm.runInNewContext(versionModule, {
    exports,
    require: (name) => {
      assert.equal(name, '../../package.json')
      return { version }
    },
  })
  assert.equal(exports.APP_VERSION, version, 'the displayed version follows the package without regeneration')
}
console.log('PASS version and local configuration: version source, build targets, deployment preflight, guest previews, write protection')

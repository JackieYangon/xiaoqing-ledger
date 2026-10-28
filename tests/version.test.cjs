const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const prepare = fs.readFileSync('scripts/prepare-local-config.cjs', 'utf8')
function generate(version) {
  const files = new Map([
    ['package.json', JSON.stringify({ version })],
    ['src/manifest.template.json', JSON.stringify({
      versionName: '0.5.0', versionCode: '50', 'mp-weixin': {},
    })],
    ['project.config.template.json', '{}'],
  ])
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
  const run = () => vm.runInNewContext(prepare, {
    require: (name) => {
      assert.equal(name, 'node:fs')
      return fixtureFs
    },
    process: { env: {} },
    console: { log() {} },
  })
  return { files, writes, run }
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
console.log('PASS version source: manifest, UI export, ordered versionCode, invalid-version write protection')

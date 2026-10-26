// Check generated files, not source estimates. Decimal limits are deliberately conservative.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(process.argv[2] || 'dist/build/mp-weixin')
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const subRoots = (app.subPackages || app.subpackages || []).map(p => p.root.replace(/\/$/, '') + '/')
const media = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|mp3|wav|aac|m4a|ogg|flac|wma)$/i
const files = []
function scan(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) scan(full)
    else if (item.isFile()) files.push({ name: path.relative(root, full).split(path.sep).join('/'), bytes: fs.statSync(full).size })
  }
}
scan(root)
const main = files.filter(f => !subRoots.some(r => f.name.startsWith(r)))
const mainBytes = main.reduce((sum, f) => sum + f.bytes, 0)
const assets = files.filter(f => media.test(f.name))
const oversized = assets.filter(f => f.bytes > 200000)
const errors = []
if (mainBytes >= 1500000) errors.push(`主包 ${mainBytes} 字节，必须小于 1500000 字节`)
if (app.lazyCodeLoading !== 'requiredComponents') errors.push('未开启 requiredComponents 按需注入')
for (const f of oversized) errors.push(`资源超过 200000 字节：${f.name} (${f.bytes})`)
console.log(`主包：${mainBytes} 字节 (${(mainBytes / 1000).toFixed(1)} KB)`)
console.log(`组件按需注入：${app.lazyCodeLoading || '未开启'}`)
console.log(`图片/音频 ${assets.length} 个，最大 ${Math.max(0, ...assets.map(f => f.bytes))} 字节`)
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
else console.log('PASS 小程序三项质量检查')

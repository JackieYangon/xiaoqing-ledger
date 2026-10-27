const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const https = require('node:https')
let config = {}
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.local.json'), 'utf8'))
} catch {}
const endpoint = process.env.XQ_DESKTOP_API_URL || config.endpoint || ''
function request(payload) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(endpoint)
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error()
    } catch {
      reject(new Error('尚未配置电脑端 HTTPS 登录网关，请联系管理员'))
      return
    }
    const body = JSON.stringify(payload)
    if (Buffer.byteLength(body) > 700000) {
      reject(new Error('请求数据过大'))
      return
    }
    const req = https.request(
      url,
      {
        method: 'POST',
        timeout: 20000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks = []
        let size = 0
        res.on('data', (data) => {
          size += data.length
          if (size > 1000000) req.destroy(new Error('服务响应过大'))
          else chunks.push(data)
        })
        res.on('end', () => {
          try {
            const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            if (!result || typeof result.ok !== 'boolean') throw Error()
            resolve(result)
          } catch {
            reject(new Error('服务响应无效'))
          }
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('网络请求超时')))
    req.on('error', () => reject(new Error('无法连接云端，请检查网络或网关配置')))
    req.end(body)
  })
}
ipcMain.handle('ledger:request', async (_event, payload) => request(payload))
ipcMain.handle('ledger:scope', () => crypto.createHash('sha256').update(endpoint).digest('hex'))
ipcMain.handle('ledger:new-token', () => crypto.randomBytes(32).toString('hex'))
ipcMain.handle('ledger:hash-token', (_event, token) => {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('登录请求无效')
  return crypto.createHash('sha256').update(token).digest('hex')
})
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    title: '小青账本',
    backgroundColor: '#f4f7f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.loadFile(path.join(__dirname, '../dist/desktop-ui/index.html'))
})
app.on('window-all-closed', () => app.quit())

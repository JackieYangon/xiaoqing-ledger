const cloud = require('wx-server-sdk')
const { createHandler } = require('./handler')
const { createFeatures } = require('./features')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
exports.main = async (event) => {
  const db = cloud.database({ throwOnNotFound: false }),
    context = cloud.getWXContext()
  // SOURCE is injected by WeChat, not supplied in event. An anonymous/client request cannot run the global timer.
  if (
    context.SOURCE === 'wx_trigger' &&
    !context.OPENID &&
    event.Type === 'Timer' &&
    event.TriggerName === 'ledgerRecurring'
  ) {
    const result = await createFeatures(db).runScheduled()
    await db
      .collection('xq_requests')
      .doc('system_recurring')
      .set({ data: { lastRun: new Date().toISOString(), healthy: result.failed === 0 } })
    return result
  }
  const services = {
    upload: async (cloudPath, fileContent) =>
      (await cloud.uploadFile({ cloudPath, fileContent })).fileID,
    urls: async (fileList) =>
      Object.fromEntries(
        (await cloud.getTempFileURL({ fileList })).fileList.map((f) => [
          f.fileID,
          f.tempFileURL || '',
        ]),
      ),
  }
  return createHandler(db, services)(event, context)
}

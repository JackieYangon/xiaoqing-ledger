const cloud = require('wx-server-sdk')
const { createHandler } = require('./handler')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
exports.main = async (event) => {
  const handler = createHandler(cloud.database({ throwOnNotFound: false }))
  return handler(event, cloud.getWXContext())
}

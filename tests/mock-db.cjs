function mockDB() {
  let docs = new Map(),
    failWrites = false,
    queue = Promise.resolve()
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  function collection(name, map) {
    return {
      doc(id) {
        const key = name + '/' + id
        return {
          get: async () => ({ data: clone((map || docs).get(key)) }),
          set: async ({ data }) => {
            if(Object.hasOwn(data,'_id'))throw new Error('Reserved _id cannot be written')
            if (failWrites) throw new Error('write failed')
            ;(map || docs).set(key, clone({ ...data, _id: id }))
          },
          remove: async () => {
            if (failWrites) throw new Error('write failed')
            ;(map || docs).delete(key)
          },
        }
      },
      where(filter) {
        return {
          orderBy(field) {
            this.field = field
            return this
          },
          limit(n) {
            this.n = n
            return this
          },
          async get() {
            return {
              data: Array.from((map || docs).entries())
                .filter(
                  ([key, value]) =>
                    key.startsWith(name + '/') &&
                    Object.entries(filter).every(([field, condition]) =>
                      condition && typeof condition === 'object'
                        ? 'gt' in condition
                          ? value[field] > condition.gt
                          : 'lte' in condition && value[field] <= condition.lte
                        : value[field] === condition,
                    ),
                )
                .map(([, value]) => clone(value))
                .sort((a, b) =>
                  String(a[this.field] || a._id).localeCompare(String(b[this.field] || b._id)),
                )
                .slice(0, this.n),
            }
          },
        }
      },
    }
  }
  const db = {
    collection: (name) => collection(name),
    command: { gt: (value) => ({ gt: value }), lte: (value) => ({ lte: value }) },
    runTransaction(fn) {
      const run = queue.then(async () => {
        const draft = new Map(Array.from(docs, ([k, v]) => [k, clone(v)]))
        const result = await fn({ collection: (name) => collection(name, draft) })
        docs = draft
        return { result }
      })
      queue = run.catch(() => {})
      return run
    },
    setFail: (v) => (failWrites = v),
    all: () => docs,
  }
  return db
}
module.exports = { mockDB }

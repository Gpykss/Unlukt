// functions/test/mockFirestore.js
// Minimal in-memory stand-in for firebase-admin Firestore, enough to test the money code:
// docs, collections, simple where() queries, transactions (reads-before-writes, all-or-nothing),
// batches, merge sets, and the increment / serverTimestamp / arrayUnion / delete sentinels.

const SENT = Symbol("sentinel");
const FieldValue = {
  increment: (n) => ({ [SENT]: "inc", n }),
  serverTimestamp: () => ({ [SENT]: "ts" }),
  arrayUnion: (...v) => ({ [SENT]: "union", v }),
  delete: () => ({ [SENT]: "del" }),
};
class Timestamp {
  constructor(ms) { this.ms = ms; this.seconds = Math.floor(ms / 1000); }
  static fromMillis(ms) { return new Timestamp(ms); }
  static fromDate(d) { return new Timestamp(d.getTime()); }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
}

let autoId = 0;
const newId = () => `id${++autoId}${Math.random().toString(36).slice(2, 8)}`;
const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Date) && !v[SENT];

function applyValue(cur, v) {
  if (v && v[SENT] === "inc") return (Number(cur) || 0) + v.n;
  if (v && v[SENT] === "ts") return new Timestamp(Date.now());
  if (v && v[SENT] === "union") return [...new Set([...(Array.isArray(cur) ? cur : []), ...v.v])];
  return v;
}
function merge(target, src) {
  const out = { ...(target || {}) };
  for (const [k, v] of Object.entries(src)) {
    if (v && v[SENT] === "del") { delete out[k]; continue; }
    if (isPlain(v)) out[k] = merge(isPlain(out[k]) ? out[k] : {}, v);
    else out[k] = applyValue(out[k], v);
  }
  return out;
}
function materialize(src) { return merge({}, src); }

class Snap {
  constructor(ref, data) { this.ref = ref; this.id = ref.id; this._d = data; this.exists = data !== undefined; }
  data() { return this._d === undefined ? undefined : JSON.parse(JSON.stringify(this._d), revive); }
  get(field) { return field.split(".").reduce((o, k) => (o == null ? undefined : o[k]), this._d); }
}
// keep Timestamps as Timestamps through data() copies
function revive(k, v) { return v && typeof v === "object" && "ms" in v && "seconds" in v ? new Timestamp(v.ms) : v; }

class DocRef {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split("/").pop(); }
  collection(name) { return new CollRef(this.db, `${this.path}/${name}`); }
  async get() { return new Snap(this, this.db.store.get(this.path)); }
  async set(data, opts) { this.db._write(this.path, data, opts); }
  async update(data) { this.db._update(this.path, data); }
}
class Query {
  constructor(db, path, filters = []) { this.db = db; this.path = path; this.filters = filters; }
  where(f, op, v) { return new Query(this.db, this.path, [...this.filters, [f, op, v]]); }
  limit() { return this; }
  _match(d) {
    return this.filters.every(([f, op, v]) => {
      const x = d[f];
      if (op === "==") return x === v;
      if (op === "in") return v.includes(x);
      if (op === ">") return (x?.toMillis ? x.toMillis() : x) > (v?.getTime ? v.getTime() : v?.toMillis ? v.toMillis() : v);
      throw new Error(`op ${op} not mocked`);
    });
  }
  async get() {
    const docs = [];
    for (const [p, d] of this.db.store) {
      const parent = p.slice(0, p.lastIndexOf("/"));
      if (parent === this.path && this._match(d)) docs.push(new Snap(new DocRef(this.db, p), d));
    }
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}
class CollRef extends Query {
  constructor(db, path) { super(db, path); }
  doc(id) { return new DocRef(this.db, `${this.path}/${id || newId()}`); }
  async add(data) { const r = this.doc(); await r.set(data); return r; }
}

class MockDb {
  constructor() { this.store = new Map(); this.txCount = 0; }
  doc(path) { return new DocRef(this, path); }
  collection(path) { return new CollRef(this, path); }
  _write(path, data, opts) {
    const prev = this.store.get(path);
    this.store.set(path, opts && opts.merge ? merge(prev, data) : materialize(data));
  }
  _update(path, data) {
    if (!this.store.has(path)) throw new Error(`update on missing doc ${path}`);
    this.store.set(path, merge(this.store.get(path), data));
  }
  batch() {
    const ops = [];
    return { set: (r, d, o) => ops.push(() => this._write(r.path, d, o)), update: (r, d) => ops.push(() => this._update(r.path, d)), commit: async () => ops.forEach((f) => f()) };
  }
  async runTransaction(fn) {
    this.txCount += 1;
    const writes = [];
    let wrote = false;
    const read = async (r) => {
      if (wrote) throw new Error("Firestore transactions require all reads to be executed before all writes");
      return r.get();
    };
    const tx = {
      get: read,
      getAll: async (...refs) => Promise.all(refs.map(read)),
      set: (r, d, o) => { wrote = true; writes.push(() => this._write(r.path, d, o)); },
      update: (r, d) => { wrote = true; writes.push(() => this._update(r.path, d)); },
      delete: (r) => { wrote = true; writes.push(() => this.store.delete(r.path)); },
    };
    const result = await fn(tx); // throws → nothing applied
    writes.forEach((w) => w());
    return result;
  }
  // helpers for tests
  data(path) { const d = this.store.get(path); return d === undefined ? undefined : JSON.parse(JSON.stringify(d), revive); }
  seed(path, data) { this.store.set(path, materialize(data)); }
  list(prefix) { return [...this.store.keys()].filter((k) => k.startsWith(prefix)); }
}

/** Installs a fake `firebase-admin` into require's cache. Returns the db. */
function installMock() {
  const db = new MockDb();
  const firestore = () => db;
  firestore.FieldValue = FieldValue;
  firestore.Timestamp = Timestamp;
  const fake = { firestore, initializeApp() {}, auth: () => ({}) };
  const path = require.resolve("firebase-admin");
  require.cache[path] = { id: path, filename: path, loaded: true, exports: fake };
  return db;
}

module.exports = { installMock, Timestamp };

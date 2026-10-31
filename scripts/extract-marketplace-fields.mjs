/**
 * One-shot recovery helper: scans backend/src for `prisma.<model>.<method>(...)`
 * and `tx.<model>.<method>(...)` calls and recursively collects object keys with
 * value-shape hints, attributing nested payloads to their relation models.
 * Used to reconstruct the marketplace Prisma models lost from schema.prisma.
 *
 * Run from backend/: node scripts/extract-marketplace-fields.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const MODELS = [
  'vendor', 'vendorNotification', 'vendorPayout',
  'product', 'productCategory', 'productImage', 'productVariation', 'productReview',
  'shopCart', 'shopCartItem', 'shopOrder', 'shopOrderItem',
  'shopPayment', 'shopPaymentEvent', 'shopRefund', 'stockMovement',
  'commissionLedger', 'marketplaceSetting', 'marketplaceAuditLog',
]

/** Relation key → owning model (so nested create/select payloads attribute correctly). */
const REL_MODEL = {
  vendor: 'vendor',
  vendors: 'vendor',
  notifications: 'vendorNotification',
  payouts: 'vendorPayout',
  product: 'product',
  products: 'product',
  category: 'productCategory',
  images: 'productImage',
  variations: 'productVariation',
  reviews: 'productReview',
  cart: 'shopCart',
  carts: 'shopCart',
  items: 'shopCartItem',
  order: 'shopOrder',
  orders: 'shopOrder',
  orderItems: 'shopOrderItem',
  payment: 'shopPayment',
  payments: 'shopPayment',
  events: 'shopPaymentEvent',
  refunds: 'shopRefund',
  ledger: 'commissionLedger',
  stockMovements: 'stockMovement',
}

/** Relation keys whose target depends on the owning model. */
const MODEL_REL_OVERRIDE = {
  shopOrder: { items: 'shopOrderItem', ledger: 'commissionLedger' },
  shopCart: { items: 'shopCartItem' },
}

const CONTEXT_KEYS = new Set([
  'where', 'data', 'select', 'include', 'orderBy', 'create', 'update', 'connect',
  'connectOrCreate', 'createMany', 'deleteMany', 'set', 'skip', 'take', 'cursor',
  'distinct', 'skipDuplicates', 'and', 'or', 'not', '_count',
])

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function valueHint(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++
  const ch = src[i]
  if (ch === '"' || ch === "'" || ch === '`') return 'string'
  if (ch === '{') return 'object'
  if (ch === '[') return 'array'
  if (/[0-9-]/.test(ch)) return 'number'
  const word = src.slice(i).match(/^(true|false|null|new Date|Date\.now|Math\.)/)
  if (word) {
    if (word[1] === 'true' || word[1] === 'false') return 'boolean'
    if (word[1] === 'null') return 'null'
    return 'date'
  }
  const id = src.slice(i).match(/^[A-Za-z_$][\w$]*/)
  return 'expr:' + (id ? id[0] : '?')
}

const SHORTHAND_EXCLUDE = new Set([
  'else', 'return', 'await', 'const', 'let', 'var', 'function', 'if', 'for', 'while',
  'new', 'throw', 'case', 'typeof', 'void', 'delete', 'do', 'in', 'of', 'yield',
  'async', 'true', 'false', 'null', 'undefined', 'break', 'continue', 'default',
  'try', 'catch', 'finally', 'instanceof', 'switch', 'class', 'extends', 'super',
])

function matchBrace(src, fromIdx) {
  const start = src.indexOf('{', fromIdx)
  if (start < 0) return -1
  let depth = 0
  let inStr = null
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (inStr) {
      if (c === '\\') { i++; continue }
      if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** Top-level `key:` positions directly inside the object starting at `start`. */
function topLevelKeys(src, start) {
  const end = matchBrace(src, start)
  if (end < 0) return []
  const keys = []
  let depth = 0
  let inStr = null
  for (let i = start; i < end; i++) {
    const c = src[i]
    if (inStr) {
      if (c === '\\') { i++; continue }
      if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue }
    if (c === '{' || c === '[' || c === '(') { depth++; continue }
    if (c === '}' || c === ']' || c === ')') { depth--; continue }
    if (depth === 1) {
      const m = src.slice(i).match(/^([A-Za-z_$][\w$]*)\s*:(?!:)/)
      if (m) {
        keys.push({ key: m[1], valueAt: i + m[0].length })
        i += m[0].length - 1
        continue
      }
      // shorthand property:  { passwordHash, type, vendorId }
      const s = src.slice(i).match(/^([A-Za-z_$][\w$]*)(?=\s*[,}\n])/)
      if (s) {
        if (!SHORTHAND_EXCLUDE.has(s[1])) {
          keys.push({ key: s[1], valueAt: i })
        }
        i += s[1].length - 1
      }
    }
  }
  return keys
}

const report = new Map(MODELS.map((m) => [m, {
  fields: {},
  relations: {},
  whereUnique: new Set(),
  methods: new Set(),
}]))

function field(model, key, hint) {
  const e = report.get(model)
  if (!e) return
  if (!e.fields[key]) e.fields[key] = new Set()
  e.fields[key].add(hint)
}
function relation(model, key, hint) {
  const e = report.get(model)
  if (!e) return
  if (!e.relations[key]) e.relations[key] = new Set()
  e.relations[key].add(hint)
}

/** Recursively attribute keys inside an object/array span to a model. */
function descend(model, src, start, depth) {
  if (depth > 7 || start < 0) return
  for (const { key, valueAt } of topLevelKeys(src, start)) {
    const hint = valueHint(src, valueAt)
    const childModel = MODEL_REL_OVERRIDE[model]?.[key] ?? REL_MODEL[key] ?? model
    if (!CONTEXT_KEYS.has(key)) field(model, key, hint)
    descendValue(childModel, src, valueAt, hint, depth + 1)
  }
}

/** Descend into whatever shape a property value has (object / array / .map callback). */
function descendValue(model, src, valueAt, hint, depth) {
  if (depth > 7) return
  if (hint === 'object') {
    const at = src.indexOf('{', valueAt)
    if (at >= 0) descend(model, src, at, depth)
  } else if (hint === 'array') {
    const arrStart = src.indexOf('[', valueAt)
    const arrEnd = matchBrace(src, valueAt)
    if (arrStart < 0 || arrEnd < 0) return
    const arrSrc = src.slice(arrStart, arrEnd)
    let idx = 0
    while (true) {
      const el = arrSrc.indexOf('{', idx)
      if (el < 0) break
      const elEnd = matchBrace(arrSrc, el)
      if (elEnd < 0) break
      descendInString(model, arrSrc.slice(el, elEnd), depth + 1)
      idx = elEnd
    }
  } else if (hint.startsWith('expr:')) {
    // e.g. `create: items.map((i) => ({ productId: i.id, ... }))`
    const near = src.slice(valueAt, valueAt + 500)
    if (/\.map\s*\(|\(.*\)\s*=>|function\s*\(/.test(near)) {
      const at = matchBrace(src, valueAt)
      const rel = src.indexOf('{', valueAt)
      if (at > 0 && rel >= 0 && at - rel < 1500) descend(model, src, rel, depth)
    }
  }
}

/** Same as descend but on an isolated source string. */
function descendInString(model, src, depth) {
  if (depth > 7) return
  const objStart = src.indexOf('{')
  if (objStart < 0) return
  for (const { key, valueAt } of topLevelKeys(src, objStart)) {
    const hint = valueHint(src, valueAt)
    const childModel = MODEL_REL_OVERRIDE[model]?.[key] ?? REL_MODEL[key] ?? model
    if (!CONTEXT_KEYS.has(key)) field(model, key, hint)
    if (hint === 'object' || hint === 'array' || hint.startsWith('expr:')) {
      if (hint === 'object' && (REL_MODEL[key] || MODEL_REL_OVERRIDE[model]?.[key])) {
        relation(model, key, 'nested:' + childModel)
      }
      descendValue(childModel, src, valueAt, hint, depth + 1)
    }
  }
}

const files = walkFiles(path.resolve('src'))
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const re = /\b(?:prisma|tx)\s*\.\s*([a-zA-Z]+)\s*\.\s*(createMany|upsert|create|findMany|findFirst|findUnique|updateMany|deleteMany|update|delete|count|groupBy)\s*\(/g
  let m
  while ((m = re.exec(src))) {
    const model = m[1]
    if (!report.has(model)) continue
    const e = report.get(model)
    e.methods.add(m[2])
    const parenIdx = m.index + m[0].length - 1
    const argStart = src.indexOf('{', parenIdx)
    if (argStart < 0) continue
    const argEnd = matchBrace(src, parenIdx)
    if (argEnd < 0) continue

    // Capture findUnique/where keys (uniqueness hints) before descending.
    for (const { key, valueAt } of topLevelKeys(src, argStart)) {
      if (key !== 'where') continue
      const wStart = src.indexOf('{', valueAt)
      if (wStart < 0) continue
      for (const wk of topLevelKeys(src, wStart)) {
        if (m[2] === 'findUnique') e.whereUnique.add(wk.key)
        field(model, wk.key, 'where:' + valueHint(src, wk.valueAt))
      }
    }
    // include/select top level → relations
    for (const { key, valueAt } of topLevelKeys(src, argStart)) {
      if (key !== 'include' && key !== 'select') continue
      const wStart = src.indexOf('{', valueAt)
      if (wStart < 0) continue
      for (const wk of topLevelKeys(src, wStart)) {
        if (wk.key === '_count') {
          const cEnd = matchBrace(src, wk.valueAt)
          const cStart = src.indexOf('{', wk.valueAt)
          const sel = topLevelKeys(src, cStart).find((x) => x.key === 'select')
          if (sel) {
            const sStart = src.indexOf('{', sel.valueAt)
            for (const r of topLevelKeys(src, sStart)) relation(model, r.key, '_count.select')
          }
          continue
        }
        const wh = valueHint(src, wk.valueAt)
        field(model, wk.key, key + ':' + wh)
        if (wh === 'object' && REL_MODEL[wk.key]) relation(model, wk.key, key + '→' + REL_MODEL[wk.key])
      }
    }
    descend(model, src, argStart, 0)
  }
}

const out = []
for (const [model, info] of report) {
  if (info.methods.size === 0 && Object.keys(info.fields).length === 0) continue
  out.push(`\n### model ${model}`)
  out.push('methods: ' + [...info.methods].join(','))
  if (info.whereUnique.size) out.push('findUnique where keys: ' + [...info.whereUnique].join(','))
  out.push('fields:')
  for (const [f, hints] of Object.entries(info.fields).sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`  ${f}: ${[...hints].join(' | ')}`)
  }
  out.push('relations:')
  for (const [r, hints] of Object.entries(info.relations).sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`  ${r}: ${[...hints].join(' | ')}`)
  }
}
console.log(out.join('\n'))

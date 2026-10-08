#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

// 1. Try running root scripts/prepare-prisma.js if available
const rootScript = path.resolve(__dirname, '../../scripts/prepare-prisma.js')
if (fs.existsSync(rootScript)) {
  try {
    execSync(`node "${rootScript}"`, { stdio: 'inherit' })
    process.exit(0)
  } catch {
    // continue to local fallback
  }
}

// 2. Local fallback for isolated backend deploy (e.g. Vercel with Root Directory = backend)
const envUrl = process.env.DATABASE_URL || ''
const isVercel = process.env.VERCEL === '1'
let provider = 'mysql'

if (
  process.env.DB_PROVIDER === 'postgresql' ||
  process.env.DB_PROVIDER === 'postgres' ||
  envUrl.startsWith('postgres://') ||
  envUrl.startsWith('postgresql://') ||
  isVercel
) {
  provider = 'postgresql'
}

const localSchema = path.resolve(__dirname, '../prisma/schema.prisma')
if (fs.existsSync(localSchema)) {
  let content = fs.readFileSync(localSchema, 'utf8')
  content = content.replace(/provider\s*=\s*"(mysql|postgresql)"/, `provider = "${provider}"`)
  fs.writeFileSync(localSchema, content, 'utf8')
  console.log(`[prepare-prisma] Set backend schema datasource provider to '${provider}'`)
}

process.exit(0)

#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

// Look for sync script at possible locations
const candidates = [
  path.resolve(__dirname, '../../scripts/sync-prisma.js'),
  path.resolve(__dirname, '../scripts/sync-prisma.js'),
  path.resolve(__dirname, './sync-prisma.js'),
]

for (const scriptPath of candidates) {
  if (fs.existsSync(scriptPath)) {
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' })
    process.exit(0)
  }
}

// Isolated backend installs do not have the root sync helper.
execSync('npx prisma generate --schema prisma/schema.prisma', {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
})

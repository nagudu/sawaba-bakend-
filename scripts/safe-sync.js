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
    try {
      execSync(`node "${scriptPath}"`, { stdio: 'inherit' })
      process.exit(0)
    } catch {
      // ignore and allow build to proceed
    }
  }
}

// If no script found, log info and exit cleanly so tsc can run
console.log('[safe-sync] No external sync script found. Proceeding with standard build.')
process.exit(0)

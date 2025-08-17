// helpers/paths.js
const path = require('path');
const fs   = require('fs');

const TRANSCRIPT_DIR =
  process.env.TRANSCRIPT_DIR || path.join(__dirname, '..', 'transcripts');

if (!fs.existsSync(TRANSCRIPT_DIR)) {
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
}

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

module.exports = { TRANSCRIPT_DIR, PUBLIC_BASE_URL };

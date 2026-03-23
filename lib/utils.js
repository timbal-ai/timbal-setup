import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const PACKAGE_VERSION = '0.2.0';

export function log(symbol, message) {
  console.log(`  ${symbol} ${message}`);
}

export function logSuccess(message) {
  log('✓', message);
}

export function logError(message) {
  log('✗', message);
}

export function logInfo(message) {
  log('~', message);
}

export function logHeader() {
  console.log('');
  console.log(`  Timbal Setup v${PACKAGE_VERSION}`);
  console.log('');
}

export function logFooter() {
  console.log('');
  console.log('  Done. Restart your agents to pick up the changes.');
  console.log('');
}

/**
 * Atomic write: write to a tmp file then rename into place.
 * On POSIX, rename(2) is atomic when src and dst are on the same filesystem.
 */
export function atomicWriteFileSync(filePath, content) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${dir}/.tmp-${randomBytes(6).toString('hex')}`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}

import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const PACKAGE_VERSION = '0.3.0';

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
 * Run a command and return { ok, stdout, stderr }.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
export function run(cmd, args) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      ok: false,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || err.message || '').trim(),
    };
  }
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

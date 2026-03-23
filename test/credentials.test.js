/**
 * credentials.test.js
 *
 * Tests for lib/credentials.js using Node's built-in test runner.
 * Run with: node --test test/credentials.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseIni, resolveToken } from '../lib/credentials.js';

// ---------------------------------------------------------------------------
// parseIni
// ---------------------------------------------------------------------------

describe('parseIni', () => {
  test('parses a simple single-section INI file', () => {
    const ini = `
[default]
token = t2_abc123
region = us-east-1
`;
    const result = parseIni(ini);
    assert.deepEqual(result['default'], { token: 't2_abc123', region: 'us-east-1' });
  });

  test('parses multiple sections', () => {
    const ini = `
[default]
token = t2_default

[staging]
token = t2_staging
api_key = override_key
`;
    const result = parseIni(ini);
    assert.equal(result['default'].token, 't2_default');
    assert.equal(result['staging'].token, 't2_staging');
    assert.equal(result['staging'].api_key, 'override_key');
  });

  test('ignores blank lines and comments', () => {
    const ini = `
# This is a comment
; Also a comment

[default]
# inline comment won't appear as a key
token = t2_abc
`;
    const result = parseIni(ini);
    assert.equal(result['default'].token, 't2_abc');
    // no comment keys
    assert.equal(Object.keys(result['default']).length, 1);
  });

  test('handles values with = signs in them', () => {
    const ini = `
[default]
token = t2_abc=extra=stuff
`;
    const result = parseIni(ini);
    assert.equal(result['default'].token, 't2_abc=extra=stuff');
  });

  test('returns empty object for empty input', () => {
    const result = parseIni('');
    assert.deepEqual(result, {});
  });

  test('handles keys with spaces around =', () => {
    const ini = `
[default]
  token   =   t2_padded  
`;
    const result = parseIni(ini);
    assert.equal(result['default'].token, 't2_padded');
  });
});

// ---------------------------------------------------------------------------
// resolveToken — env var and explicit token (no file I/O needed for these)
// ---------------------------------------------------------------------------

describe('resolveToken', () => {
  // Save and restore env vars around each test
  let savedEnv;

  test('returns the explicit --token flag first', () => {
    const { token, source } = resolveToken({ token: 't2_explicit', profile: 'default' });
    assert.equal(token, 't2_explicit');
    assert.match(source, /--token flag/);
  });

  test('returns TIMBAL_API_KEY env var when no --token flag', () => {
    const orig = process.env.TIMBAL_API_KEY;
    const origToken = process.env.TIMBAL_API_TOKEN;
    delete process.env.TIMBAL_API_TOKEN;
    process.env.TIMBAL_API_KEY = 't2_from_env';
    try {
      const { token, source } = resolveToken({});
      assert.equal(token, 't2_from_env');
      assert.match(source, /TIMBAL_API_KEY/);
    } finally {
      if (orig === undefined) delete process.env.TIMBAL_API_KEY;
      else process.env.TIMBAL_API_KEY = orig;
      if (origToken !== undefined) process.env.TIMBAL_API_TOKEN = origToken;
    }
  });

  test('returns TIMBAL_API_TOKEN env var when TIMBAL_API_KEY not set', () => {
    const origKey = process.env.TIMBAL_API_KEY;
    const origToken = process.env.TIMBAL_API_TOKEN;
    delete process.env.TIMBAL_API_KEY;
    process.env.TIMBAL_API_TOKEN = 't2_from_token_env';
    try {
      const { token, source } = resolveToken({});
      assert.equal(token, 't2_from_token_env');
      assert.match(source, /TIMBAL_API_TOKEN/);
    } finally {
      if (origKey !== undefined) process.env.TIMBAL_API_KEY = origKey;
      if (origToken === undefined) delete process.env.TIMBAL_API_TOKEN;
      else process.env.TIMBAL_API_TOKEN = origToken;
    }
  });

  test('returns null when no token found anywhere', () => {
    const origKey = process.env.TIMBAL_API_KEY;
    const origToken = process.env.TIMBAL_API_TOKEN;
    const origProfile = process.env.TIMBAL_PROFILE;
    delete process.env.TIMBAL_API_KEY;
    delete process.env.TIMBAL_API_TOKEN;
    // Use a profile that almost certainly does not exist
    process.env.TIMBAL_PROFILE = '__nonexistent_profile_xyz__';
    try {
      const { token, source } = resolveToken({});
      assert.equal(token, null);
      assert.equal(source, null);
    } finally {
      if (origKey !== undefined) process.env.TIMBAL_API_KEY = origKey;
      if (origToken !== undefined) process.env.TIMBAL_API_TOKEN = origToken;
      if (origProfile === undefined) delete process.env.TIMBAL_PROFILE;
      else process.env.TIMBAL_PROFILE = origProfile;
    }
  });

  test('explicit token takes precedence over env vars', () => {
    const origKey = process.env.TIMBAL_API_KEY;
    process.env.TIMBAL_API_KEY = 't2_from_env_should_be_ignored';
    try {
      const { token, source } = resolveToken({ token: 't2_explicit_wins' });
      assert.equal(token, 't2_explicit_wins');
      assert.match(source, /--token flag/);
    } finally {
      if (origKey === undefined) delete process.env.TIMBAL_API_KEY;
      else process.env.TIMBAL_API_KEY = origKey;
    }
  });
});

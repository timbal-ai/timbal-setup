/**
 * mcp.test.js
 *
 * Tests for lib/mcp.js using Node's built-in test runner.
 *
 * Since mcp.js now delegates to `claude mcp add/remove/get` CLI commands,
 * these tests verify the module exports the expected functions and that
 * hasClaudeCli() returns a boolean. Full integration testing requires
 * the `claude` CLI to be installed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hasClaudeCli, writeMcpConfig, removeMcpConfig, hasMcpConfig } from '../lib/mcp.js';

describe('mcp module exports', () => {
  test('exports writeMcpConfig as a function', () => {
    assert.equal(typeof writeMcpConfig, 'function');
  });

  test('exports removeMcpConfig as a function', () => {
    assert.equal(typeof removeMcpConfig, 'function');
  });

  test('exports hasMcpConfig as a function', () => {
    assert.equal(typeof hasMcpConfig, 'function');
  });

  test('exports hasClaudeCli as a function', () => {
    assert.equal(typeof hasClaudeCli, 'function');
  });
});

describe('hasClaudeCli', () => {
  test('returns a boolean', () => {
    const result = hasClaudeCli();
    assert.equal(typeof result, 'boolean');
  });
});

describe('hasMcpConfig', () => {
  test('returns a boolean', () => {
    const result = hasMcpConfig();
    assert.equal(typeof result, 'boolean');
  });
});

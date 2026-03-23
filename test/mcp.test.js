/**
 * mcp.test.js
 *
 * Tests for lib/mcp.js using Node's built-in test runner.
 * Run with: node --test test/mcp.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildMcpEntry,
  readSettings,
  mergeTimbalMcp,
  removeTimbalMcp,
  writeMcpConfig,
  removeMcpConfig,
  hasMcpConfig,
} from '../lib/mcp.js';

// ---------------------------------------------------------------------------
// buildMcpEntry
// ---------------------------------------------------------------------------

describe('buildMcpEntry', () => {
  test('returns correct shape', () => {
    const entry = buildMcpEntry('t2_test_token');
    assert.equal(entry.url, 'https://api.timbal.ai/mcp');
    assert.equal(entry.type, 'http');
    assert.equal(entry.headers.Authorization, 'Bearer t2_test_token');
  });

  test('embeds the token in the Authorization header', () => {
    const entry = buildMcpEntry('t2_xyz');
    assert.match(entry.headers.Authorization, /t2_xyz/);
  });
});

// ---------------------------------------------------------------------------
// readSettings
// ---------------------------------------------------------------------------

describe('readSettings', () => {
  test('returns empty object for non-existent file', () => {
    const result = readSettings('/tmp/__nonexistent_timbal_test_file__.json');
    assert.deepEqual(result, {});
  });

  test('parses valid JSON', () => {
    const dir = join(tmpdir(), `timbal-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'settings.json');
    writeFileSync(file, JSON.stringify({ foo: 'bar', nested: { a: 1 } }));
    try {
      const result = readSettings(file);
      assert.equal(result.foo, 'bar');
      assert.equal(result.nested.a, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns empty object for invalid JSON', () => {
    const dir = join(tmpdir(), `timbal-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'settings.json');
    writeFileSync(file, 'this is not { valid json');
    try {
      const result = readSettings(file);
      assert.deepEqual(result, {});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// mergeTimbalMcp — does NOT clobber existing mcpServers entries
// ---------------------------------------------------------------------------

describe('mergeTimbalMcp', () => {
  test('adds mcpServers.timbal when mcpServers is absent', () => {
    const settings = { someOtherKey: true };
    mergeTimbalMcp(settings, 't2_tok');
    assert.ok(settings.mcpServers, 'mcpServers should be created');
    assert.ok(settings.mcpServers.timbal, 'timbal key should exist');
    assert.equal(settings.someOtherKey, true, 'existing keys must be preserved');
  });

  test('adds timbal without clobbering existing mcpServers entries', () => {
    const settings = {
      mcpServers: {
        existingServer: {
          url: 'https://other.server.example.com/mcp',
          type: 'http',
        },
      },
    };
    mergeTimbalMcp(settings, 't2_tok');
    // Existing entry should still be there
    assert.ok(settings.mcpServers.existingServer, 'existing server must not be removed');
    assert.equal(
      settings.mcpServers.existingServer.url,
      'https://other.server.example.com/mcp',
      'existing server url must be unchanged'
    );
    // timbal entry should be added
    assert.ok(settings.mcpServers.timbal, 'timbal key must be added');
  });

  test('overwrites timbal entry if it already exists', () => {
    const settings = {
      mcpServers: {
        timbal: { url: 'https://old-url.example.com', type: 'http', headers: { Authorization: 'Bearer old_token' } },
      },
    };
    mergeTimbalMcp(settings, 't2_new_token');
    assert.equal(settings.mcpServers.timbal.headers.Authorization, 'Bearer t2_new_token');
    assert.equal(settings.mcpServers.timbal.url, 'https://api.timbal.ai/mcp');
  });

  test('returns the mutated settings object', () => {
    const settings = {};
    const returned = mergeTimbalMcp(settings, 't2_tok');
    assert.strictEqual(returned, settings);
  });
});

// ---------------------------------------------------------------------------
// removeTimbalMcp
// ---------------------------------------------------------------------------

describe('removeTimbalMcp', () => {
  test('removes the timbal key from mcpServers', () => {
    const settings = {
      mcpServers: {
        timbal: { url: 'https://api.timbal.ai/mcp' },
        other: { url: 'https://other.example.com' },
      },
    };
    removeTimbalMcp(settings);
    assert.ok(!settings.mcpServers.timbal, 'timbal key should be removed');
    assert.ok(settings.mcpServers.other, 'other key should remain');
  });

  test('is a no-op when mcpServers is absent', () => {
    const settings = { foo: 'bar' };
    assert.doesNotThrow(() => removeTimbalMcp(settings));
    assert.equal(settings.foo, 'bar');
  });

  test('is a no-op when timbal key is absent', () => {
    const settings = { mcpServers: { other: { url: 'https://other.example.com' } } };
    assert.doesNotThrow(() => removeTimbalMcp(settings));
    assert.ok(settings.mcpServers.other);
  });
});

// ---------------------------------------------------------------------------
// writeMcpConfig / removeMcpConfig / hasMcpConfig — file I/O integration
// ---------------------------------------------------------------------------

describe('writeMcpConfig / removeMcpConfig / hasMcpConfig', () => {
  let tmpDir;

  test('creates settings.json when it does not exist', () => {
    const dir = join(tmpdir(), `timbal-test-${Date.now()}-a`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'settings.json');
    try {
      writeMcpConfig(file, 't2_create_test');
      assert.ok(existsSync(file), 'settings.json should be created');
      const settings = readSettings(file);
      assert.ok(settings.mcpServers?.timbal, 'timbal entry should exist');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does not clobber existing keys in settings.json', () => {
    const dir = join(tmpdir(), `timbal-test-${Date.now()}-b`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'settings.json');
    writeFileSync(file, JSON.stringify({
      theme: 'dark',
      mcpServers: { other: { url: 'https://other.example.com' } },
    }));
    try {
      writeMcpConfig(file, 't2_merge_test');
      const settings = readSettings(file);
      assert.equal(settings.theme, 'dark', 'theme key must be preserved');
      assert.ok(settings.mcpServers.other, 'other MCP server must be preserved');
      assert.ok(settings.mcpServers.timbal, 'timbal entry must be added');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('hasMcpConfig returns true after write, false after remove', () => {
    const dir = join(tmpdir(), `timbal-test-${Date.now()}-c`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'settings.json');
    try {
      assert.equal(hasMcpConfig(file), false, 'should be false before write');
      writeMcpConfig(file, 't2_tok');
      assert.equal(hasMcpConfig(file), true, 'should be true after write');
      removeMcpConfig(file);
      assert.equal(hasMcpConfig(file), false, 'should be false after remove');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('removeMcpConfig is a no-op when file does not exist', () => {
    assert.doesNotThrow(() => removeMcpConfig('/tmp/__nonexistent_settings_file__.json'));
  });
});

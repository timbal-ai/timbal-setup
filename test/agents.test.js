/**
 * agents.test.js
 *
 * Tests for lib/agents.js using Node's built-in test runner.
 * Run with: node --test test/agents.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_AGENTS, detectAgents, getAgents } from '../lib/agents.js';

describe('ALL_AGENTS', () => {
  test('includes claude-code entry', () => {
    const ids = ALL_AGENTS.map((a) => a.id);
    assert.ok(ids.includes('claude-code'), 'should have claude-code agent');
  });

  test('every agent has required fields', () => {
    for (const agent of ALL_AGENTS) {
      assert.ok(typeof agent.id === 'string', `${agent.id}: id must be string`);
      assert.ok(typeof agent.name === 'string', `${agent.id}: name must be string`);
      assert.ok(typeof agent.detect === 'function', `${agent.id}: detect must be function`);
      assert.ok(typeof agent.configDir === 'function', `${agent.id}: configDir must be function`);
      assert.ok(typeof agent.settingsFile === 'function', `${agent.id}: settingsFile must be function`);
      assert.ok(typeof agent.skillsDir === 'function', `${agent.id}: skillsDir must be function`);
    }
  });

  test('claude-code settingsFile returns path ending in settings.json', () => {
    const agent = ALL_AGENTS.find((a) => a.id === 'claude-code');
    assert.ok(agent.settingsFile().endsWith('settings.json'));
  });

  test('claude-code skillsDir returns path containing timbal', () => {
    const agent = ALL_AGENTS.find((a) => a.id === 'claude-code');
    assert.ok(agent.skillsDir().includes('timbal'));
  });

  test('detect() returns a boolean', () => {
    for (const agent of ALL_AGENTS) {
      const result = agent.detect();
      assert.ok(typeof result === 'boolean', `${agent.id}: detect() should return boolean`);
    }
  });
});

describe('getAgents', () => {
  test('returns all agents when no filter provided', () => {
    const agents = getAgents(undefined);
    assert.equal(agents.length, ALL_AGENTS.length);
  });

  test('returns all agents when empty filter array provided', () => {
    const agents = getAgents([]);
    assert.equal(agents.length, ALL_AGENTS.length);
  });

  test('filters to matching agents', () => {
    const agents = getAgents(['claude-code']);
    assert.equal(agents.length, 1);
    assert.equal(agents[0].id, 'claude-code');
  });

  test('returns empty array for unknown agent id', () => {
    const agents = getAgents(['nonexistent-agent']);
    assert.equal(agents.length, 0);
  });
});

describe('detectAgents', () => {
  test('returns an array', () => {
    const agents = detectAgents(undefined);
    assert.ok(Array.isArray(agents));
  });

  test('only returns agents that pass detect()', () => {
    const agents = detectAgents(undefined);
    for (const agent of agents) {
      assert.ok(agent.detect(), `${agent.id} should have passed detection`);
    }
  });

  test('respects filter — unknown agent id returns empty array', () => {
    const agents = detectAgents(['nonexistent-agent-xyz']);
    assert.equal(agents.length, 0);
  });

  test('filter by known agent id returns at most 1 result', () => {
    const agents = detectAgents(['claude-code']);
    assert.ok(agents.length <= 1);
    if (agents.length === 1) {
      assert.equal(agents[0].id, 'claude-code');
    }
  });
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzePassword, analyzePasswordAsync, grade, sha1, parseRangeResponse } = require('../src');

test('public local API returns an inspectable result without network work', () => {
  const result = analyzePassword('flareon', { userInputs: ['alex'] });
  assert.equal(result.breachStatus, 'not-checked');
  assert.equal(result.pwnedChecks.length, 0);
  assert.ok(result.modernLexicon.matches.some((match) => match.token === 'flareon'));
  assert.ok(Number.isFinite(result.score.effectiveLog10));
  assert.equal(result.score.grade.letter, grade(result.score.effectiveLog10).letter);
  assert.deepEqual(result.score.band, result.score.grade);
});

test('public async API accepts a supplied fetch implementation', async () => {
  const responseText = 'D41D8CD98F00B204E9800998ECF8427E:2\r\n';
  const result = await analyzePasswordAsync('anything-safe', {
    pwned: {
      fetch: async () => ({ ok: true, text: async () => responseText })
    }
  });
  assert.equal(result.breachStatus, 'checked');
  assert.ok(result.pwnedChecks.length >= 1);
});

test('SHA-1 helper has the documented HIBP test-vector value', () => {
  assert.equal(sha1('P@ssw0rd'), '21BD12DC183F740EE76F27B78EB39C8AD972A757');
  assert.equal(parseRangeResponse('AAAA:0\r\nBBBB:4').get('BBBB'), 4);
});

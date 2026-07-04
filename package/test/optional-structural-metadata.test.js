'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzePassword } = require('../src/analyse');

test('returns an ordinary score when no period candidate beats zxcvbn', () => {
  const result = analyzePassword('111111112', { userInputs: [] });
  assert.equal(result.unavailable, false);
  assert.equal(result.score.changedByStructure, false);
  assert.equal(
    result.structuralDetections.some((detection) => detection.id === 'interleaved-structured-streams'),
    false
  );
});

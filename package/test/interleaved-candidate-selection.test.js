'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zxcvbn } = require('../src/zxcvbn');
const { analyzePassword } = require('../src/analyse');
const { detectStructure } = require('../src/heuristics');

function score(text) {
  return zxcvbn(text, []);
}

function interleaved(password) {
  return detectStructure(password, score).find(
    (detection) => detection.id === 'interleaved-structured-streams'
  );
}

const core = '1a1b1c1d1e1f1g1h';

test('compares every full-password period candidate instead of stripping edge characters', () => {
  const hit = interleaved(`${core}2`);

  assert.ok(hit);
  assert.equal(hit.period, 2);
  assert.deepEqual(hit.streams, ['111111112', 'abcdefgh']);
  assert.deepEqual([hit.spanStart, hit.spanEnd], [0, core.length + 1]);
});

test('letter and digit endings stay inside the period-2 model when it is cheapest', () => {
  const letter = analyzePassword(`${core}p`, { userInputs: [] });
  const digit = analyzePassword(`${core}2`, { userInputs: [] });

  const letterHit = letter.structuralDetections.find(
    (detection) => detection.id === 'interleaved-structured-streams'
  );
  const digitHit = digit.structuralDetections.find(
    (detection) => detection.id === 'interleaved-structured-streams'
  );

  assert.equal(letterHit.interleavePeriod, 2);
  assert.equal(digitHit.interleavePeriod, 2);
  assert.deepEqual(letterHit.interleaveStreams, ['11111111p', 'abcdefgh']);
  assert.deepEqual(digitHit.interleaveStreams, ['111111112', 'abcdefgh']);
  assert.equal(letter.score.effectiveLog10, digit.score.effectiveLog10);
});

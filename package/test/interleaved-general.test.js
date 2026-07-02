'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zxcvbn } = require('../src/zxcvbn');
const { detectStructure, applyStructuralCaps } = require('../src/heuristics');

function score(text) {
  return zxcvbn(text, []);
}

function interleaved(detections) {
  return detections.find((detection) => detection.id === 'interleaved-structured-streams');
}

test('recovers keyboard and numeric streams', () => {
  const password = 'q1w2e3r4t5y6';
  const detections = detectStructure(password, score);
  const hit = interleaved(detections);

  assert.ok(hit);
  assert.equal(hit.scorerAware, true);
  assert.deepEqual([hit.first, hit.second], ['qwerty', '123456']);
  assert.ok(applyStructuralCaps(12, detections, score).effectiveLog10 < 3);
});

test('keeps a trailing literal outside recovered predictable streams', () => {
  const password = 'z3x3c3v3b3n344';
  const detections = detectStructure(password, score);
  const hit = interleaved(detections);

  assert.ok(hit);
  assert.deepEqual([hit.first, hit.second], ['zxcvbn', '333333']);
  assert.deepEqual([hit.spanStart, hit.spanEnd], [0, 12]);

  const capped = applyStructuralCaps(14, detections, score);
  assert.ok(capped.composition.pieces.some((piece) =>
    piece.type === 'literal' && piece.start === 12 && piece.end === password.length
  ));
});

test('does not call two generic streams an interleaving', () => {
  assert.equal(interleaved(detectStructure('p5Q3R6T8', score)), undefined);
});

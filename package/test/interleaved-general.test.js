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

test('scores the complete unstripped password rather than recovering a shorter tail-free core', () => {
  const password = 'z3x3c3v3b3n344';
  const detections = detectStructure(password, score);
  const hit = interleaved(detections);

  assert.ok(hit);
  assert.deepEqual([hit.first, hit.second], ['zxcvbn4', '3333334']);
  assert.deepEqual([hit.spanStart, hit.spanEnd], [0, password.length]);
});

test('does not report a period model when no tested period beats ordinary zxcvbn', () => {
  assert.equal(interleaved(detectStructure('p5Q3R6T8', score)), undefined);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectStructure, applyStructuralCaps } = require('../src/heuristics');

function score(segment) {
  return { guessesLog10: ({ g: 1, X: 1, tail: 2 }[segment] ?? 20) };
}

function interleaved(detections) {
  return detections.find((detection) => detection.id === 'interleaved-structured-streams');
}

test('keeps an established interleaved alpha-digit span when one literal suffix follows', () => {
  const password = 'a7b7c7d7e7f7gg';
  const detections = detectStructure(password);
  const hit = interleaved(detections);

  assert.ok(hit);
  assert.deepEqual([hit.spanStart, hit.spanEnd], [0, password.length - 1]);

  const capped = applyStructuralCaps(14, detections, score);
  assert.ok(capped.effectiveLog10 < 14, `${capped.effectiveLog10} did not retain the established interleaving`);
  assert.ok(capped.composition?.pieces.some((piece) =>
    piece.type === 'literal' && piece.start === password.length - 1 && piece.end === password.length
  ));
});

test('keeps an established interleaved alpha-digit span with unrelated material on both sides', () => {
  const password = 'Xa7b7c7d7e7f7gg';
  const detections = detectStructure(password);
  const hit = interleaved(detections);

  assert.ok(hit);
  assert.deepEqual([hit.spanStart, hit.spanEnd], [1, password.length - 1]);
});

test('does not infer interleaved simple streams when neither every-other stream is simple', () => {
  const detections = detectStructure('a7b8c7d9e7f0g');
  assert.equal(interleaved(detections), undefined);
});

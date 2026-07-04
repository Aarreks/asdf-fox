'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zxcvbn } = require('../src/zxcvbn');
const { detectStructure } = require('../src/heuristics');

function score(text) {
  return zxcvbn(text, []);
}

function interleaved(password) {
  return detectStructure(password, score).find(
    (detection) => detection.id === 'interleaved-structured-streams'
  );
}

test('does not use a separate simple-stream detector when no scorer is supplied', () => {
  const detections = detectStructure('a7b7c7d7e7f7gg');
  assert.equal(detections.find((detection) => detection.id === 'interleaved-structured-streams'), undefined);
});

test('scores a period-2 candidate even when only one stream has a recognizable zxcvbn parse', () => {
  const hit = interleaved('a7b8c7d9e7f0g');
  assert.ok(hit);
  assert.equal(hit.period, 2);
  assert.deepEqual(hit.streams, ['abcdefg', '787970']);
  assert.deepEqual(hit.recognizedStreamIndexes, [0]);
});

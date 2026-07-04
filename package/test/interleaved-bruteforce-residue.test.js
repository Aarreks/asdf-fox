'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zxcvbn } = require('../src/zxcvbn');
const { analyzePassword } = require('../src/analyse');
const { detectStructure, applyStructuralCaps } = require('../src/heuristics');

function score(text) {
  return zxcvbn(text, []);
}

function weave(streams) {
  let output = '';
  const length = Math.max(...streams.map((stream) => stream.length));
  for (let index = 0; index < length; index += 1) {
    for (const stream of streams) output += stream[index] || '';
  }
  return output;
}

function interleaved(password) {
  return detectStructure(password, score).find(
    (detection) => detection.id === 'interleaved-structured-streams'
  );
}

test('scores every residue, including a fully bruteforce stream, with no evidence surcharge', () => {
  const streams = ['gggg', 'aaaa', 'yyyy', '2$k9'];
  const password = weave(streams);
  const hit = interleaved(password);

  assert.ok(hit);
  assert.equal(hit.scorerAware, true);
  assert.equal(hit.period, 4);
  assert.deepEqual(hit.streams, streams);
  assert.deepEqual(hit.recognizedStreamIndexes, [0, 1, 2]);
  assert.equal(hit.evidenceLog10, 0);

  const baseline = score(password).guessesLog10;
  const adjusted = applyStructuralCaps(baseline, detectStructure(password, score), score);
  const expected = streams.reduce((total, stream) => total + score(stream).guessesLog10, 0) +
    hit.reconstructionLog10;

  assert.ok(Math.abs(adjusted.effectiveLog10 - expected) < 1e-9);
  assert.ok(adjusted.effectiveLog10 < baseline - 2);
});

test('does not require zxcvbn parse metadata to construct a period candidate', () => {
  const password = 'a1b2c3d4e5f6';
  const scoreWithoutPatterns = (text) => ({ guessesLog10: text === password ? 20 : 1 });
  const hit = detectStructure(password, scoreWithoutPatterns).find(
    (detection) => detection.id === 'interleaved-structured-streams'
  );

  assert.ok(hit);
  assert.equal(hit.period, 2);
  assert.deepEqual(hit.recognizedStreamIndexes, []);
  assert.deepEqual(hit.streams, ['abcdef', '123456']);
});

test('spatial keyboard paths remain available to the baseline and metadata', () => {
  const path = score('zxcvb');
  assert.equal(path.sequence.length, 1);
  assert.equal(path.sequence[0].pattern, 'spatial');
  assert.equal(path.sequence[0].graph, 'qwerty');
  assert.ok(path.guessesLog10 < 3.3);

  const password = weave(['ggggg', 'aaaaa', 'yyyyy', 'zxcvb']);
  const result = analyzePassword(password, { userInputs: [] });
  const hit = result.structuralDetections.find(
    (detection) => detection.id === 'interleaved-structured-streams'
  );

  assert.ok(hit);
  assert.equal(hit.interleavePeriod, 4);
  assert.deepEqual(hit.interleaveStreams, ['ggggg', 'aaaaa', 'yyyyy', 'zxcvb']);
  assert.deepEqual(hit.interleaveRecognizedStreamIndexes, [0, 1, 2, 3]);
  assert.equal(hit.interleaveEvidenceLog10, 0);
});

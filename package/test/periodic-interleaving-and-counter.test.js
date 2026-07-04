'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { zxcvbn } = require('../src/zxcvbn');
const { analyzePassword } = require('../src/analyse');
const { detectStructure, applyStructuralCaps } = require('../src/heuristics');

function score(text) {
  return zxcvbn(text, []);
}

function find(detections, id) {
  return detections.find((detection) => detection.id === id);
}

function weave(streams) {
  let output = '';
  const length = Math.max(...streams.map((stream) => stream.length));
  for (let index = 0; index < length; index += 1) {
    for (const stream of streams) output += stream[index] || '';
  }
  return output;
}

test('recognizes short repeated tags with positive, negative, and wide arithmetic steps', () => {
  const cases = [
    ['c16c17c18c19c20m', 'c', 16, 1, 5, [0, 15]],
    ['c20c22c24c26c28m', 'c', 20, 2, 5, [0, 15]],
    ['x98x100x102x104x106z', 'x', 98, 2, 5, [0, 19]],
    ['d400d357d314d271d228m', 'd', 400, -43, 5, [0, 20]],
    ['q100q150q200q250q300x', 'q', 100, 50, 5, [0, 20]]
  ];

  for (const [password, root, start, step, terms, span] of cases) {
    const detection = find(detectStructure(password), 'numbered-repeated-token-sequence');
    assert.ok(detection, password);
    assert.equal(detection.root, root, password);
    assert.equal(detection.start, start, password);
    assert.equal(detection.step, step, password);
    assert.equal(detection.terms, terms, password);
    assert.deepEqual([detection.spanStart, detection.spanEnd], span, password);
  }

  const password = 'c20c22c24c26c28m';
  const detections = detectStructure(password, score);
  const baseline = score(password).guessesLog10;
  const adjusted = applyStructuralCaps(baseline, detections, score);
  assert.ok(adjusted.effectiveLog10 < baseline - 5, `${adjusted.effectiveLog10} did not substantially reduce ${password}`);
  assert.ok(adjusted.composition?.detectorIds.includes('numbered-repeated-token-sequence'));
});

test('requires four terms for a one- or two-character counter tag and preserves exact arithmetic', () => {
  for (const password of [
    'c16c17c18',
    'ab1ab2ab3',
    'c16c17c19c20',
    'c16d17c18c19',
    'c16c16c16c16'
  ]) {
    assert.equal(
      find(detectStructure(password), 'numbered-repeated-token-sequence'),
      undefined,
      password
    );
  }
});

test('recovers period 3, 4, and 5 interleavings from separately recognizable streams', () => {
  const cases = [
    ['qa1wa2ea3ra4ta5ya6', 3, ['qwerty', 'aaaaaa', '123456']],
    ['qa1zwa2zea3zra4zta5zya6z', 4, ['qwerty', 'aaaaaa', '123456', 'zzzzzz']],
    ['qa1zawa2zsea3zdra4zfta5zgya6zh', 5, ['qwerty', 'aaaaaa', '123456', 'zzzzzz', 'asdfgh']]
  ];

  for (const [password, period, streams] of cases) {
    const detections = detectStructure(password, score);
    const detection = find(detections, 'interleaved-structured-streams');
    assert.ok(detection, password);
    assert.equal(detection.scorerAware, true, password);
    assert.equal(detection.period, period, password);
    assert.deepEqual(detection.streams, streams, password);
    assert.ok(detection.reconstructionLog10 > 0, password);

    const baseline = score(password).guessesLog10;
    const adjusted = applyStructuralCaps(baseline, detections, score);
    assert.ok(adjusted.effectiveLog10 < baseline - 4, `${password}: ${adjusted.effectiveLog10} did not materially reduce ${baseline}`);
    assert.ok(adjusted.composition?.detectorIds.includes('interleaved-structured-streams'), password);
  }
});

test('recovers a period-6 weave because every period through six is considered', () => {
  const streams = ['qwerty', 'asdfgh', 'zxcvbn', '123456', '000000', 'aaaaaa'];
  const password = weave(streams);
  const detection = find(detectStructure(password, score), 'interleaved-structured-streams');

  assert.ok(detection);
  assert.equal(detection.period, 6);
  assert.deepEqual(detection.streams, streams);
  assert.equal(detection.periodChoiceCount, 5);
  assert.deepEqual([detection.spanStart, detection.spanEnd], [0, password.length]);
});

test('constructs every full-password period candidate without recognizing a pattern first', () => {
  const password = 'a1b2c3d4e5f6';
  const scoreWithoutPatterns = (text) => ({ guessesLog10: text === password ? 20 : 1 });
  const detection = find(detectStructure(password, scoreWithoutPatterns), 'interleaved-structured-streams');

  assert.ok(detection);
  assert.equal(detection.period, 2);
  assert.deepEqual(detection.recognizedStreamIndexes, []);
  assert.deepEqual(detection.streams, ['abcdef', '123456']);
});

test('scores residue streams for every permitted period before selecting the minimum', () => {
  const password = 'abcdefghijkl';
  const calls = new Set();
  const scoreAll = (text) => {
    calls.add(text);
    return { guessesLog10: text === password ? 100 : 10 };
  };

  const detection = find(detectStructure(password, scoreAll), 'interleaved-structured-streams');
  assert.ok(detection);

  for (const stream of [
    'acegik', 'bdfhjl',                 // period 2
    'adgj', 'behk', 'cfil',             // period 3
    'aei', 'bfj', 'cgk', 'dhl'          // period 4
  ]) {
    assert.ok(calls.has(stream), `missing score call for ${stream}`);
  }
});

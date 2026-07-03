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

test('recovers a bounded local period-3 weave and publishes its reconstruction cost', () => {
  const password = `X${weave(['qwerty', 'aaaaaa', '123456'])}Y`;
  const result = analyzePassword(password, { userInputs: [] });
  const detection = result.structuralDetections.find(
    (item) => item.id === 'interleaved-structured-streams'
  );

  assert.ok(detection);
  assert.equal(detection.interleavePeriod, 3);
  assert.deepEqual(detection.interleaveStreams, ['qwerty', 'aaaaaa', '123456']);
  assert.ok(detection.interleaveReconstructionLog10 > 0);
  assert.deepEqual([detection.spanStart, detection.spanEnd], [1, password.length - 1]);
  assert.equal(detection.selectedInComposite, true);
});

test('does not classify varied non-weaves as scorer-aware period interleavings', () => {
  for (const password of [
    'p5Q3R6T8',
    'a7b8c7d9e7f0g',
    'c16c17c19c20',
    'wirelessBatteryRouter42',
    'A9mQ4vT2rX7pL5sZ'
  ]) {
    const detections = detectStructure(password, score);
    const detection = find(detections, 'interleaved-structured-streams');
    assert.ok(!detection || detection.scorerAware === false, password);
  }
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzePassword } = require('../src/analyse');

test('serializes optional null structural evidence without blocking a score', () => {
  const result = analyzePassword('111111112', { userInputs: [] });
  const interleaving = result.structuralDetections.find(
    (detection) => detection.id === 'interleaved-structured-streams'
  );

  assert.ok(Number.isFinite(result.score.baselineLog10));
  assert.ok(Number.isFinite(result.score.effectiveLog10));
  assert.equal(interleaving.interleavePeriod, 2);
  assert.deepEqual(interleaving.interleaveStreams, ['1111', '1111']);
  assert.equal(interleaving.interleaveReconstructionLog10, null);
  assert.equal(interleaving.interleaveEvidenceLog10, null);
});

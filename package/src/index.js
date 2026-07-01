'use strict';

const { analyzePassword, analyzePasswordAsync, grade, band } = require('./analyse');
const { buildVariantCandidates } = require('./variants');
const { checkPwned, clearPwnedRangeCache, parseRangeResponse, sha1 } = require('./pwned');
const { findModernLexiconMatches, metadata: modernLexiconMetadata } = require('./modernLexicon');

module.exports = {
  analyzePassword,
  analyzePasswordAsync,
  grade,
  band,
  buildVariantCandidates,
  checkPwned,
  clearPwnedRangeCache,
  parseRangeResponse,
  sha1,
  findModernLexiconMatches,
  modernLexiconMetadata
};

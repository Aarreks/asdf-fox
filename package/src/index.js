'use strict';

const { analyzePassword, analyzePasswordAsync, band } = require('./analyse');
const { buildVariantCandidates } = require('./variants');
const { checkPwned, clearPwnedRangeCache, parseRangeResponse, sha1 } = require('./pwned');
const { findModernLexiconMatches, metadata: modernLexiconMetadata } = require('./modernLexicon');

module.exports = {
  analyzePassword,
  analyzePasswordAsync,
  band,
  buildVariantCandidates,
  checkPwned,
  clearPwnedRangeCache,
  parseRangeResponse,
  sha1,
  findModernLexiconMatches,
  modernLexiconMetadata
};

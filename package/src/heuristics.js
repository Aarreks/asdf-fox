'use strict';

function log10(value) {
  return Math.log(value) / Math.LN10;
}

function segmentLog10(scoreSegment, value) {
  return value.length === 0 ? 0 : scoreSegment(value).guessesLog10;
}

function numericStartChoices(width) {
  // No leading zero for multi-digit terms. This is an estimate of the number
  // of possible first values, not a claim that all values are equally likely.
  return width === 1 ? 10 : 9 * (10 ** (width - 1));
}

function arithmeticRunModelLog10({ width, step, terms }) {
  // A transparent, deliberately conservative enumeration model for ONLY the
  // raw numeric run. Surrounding material is charged separately by the
  // structural parser, so a detected suffix cannot erase prefix cost.
  const start = log10(numericStartChoices(width));
  const stepChoices = Math.max(6, Math.min(28, 4 + 2 * Math.abs(step)));
  const stepCost = log10(stepChoices);
  const termCount = log10(Math.max(4, terms));
  const construction = 0.7;
  return start + stepCost + termCount + construction;
}

function isDigitArithmeticSequence(text) {
  if (!/^\d{6,}$/u.test(text)) return null;

  // Keep the longest established arithmetic prefix rather than requiring a
  // whole contiguous digit run to be perfect. A human may append unrelated
  // digits after an unmistakable sequence:
  //   98 | 99 | 100 | 101 | 102 | 102
  // The final 102 stays literal material; it must not erase the valid prefix.
  //
  // Three terms establish a progression. Requiring five created a score cliff
  // when an already-obvious four-term run gained its next deterministic term.
  let best = null;
  for (let width = 1; width <= Math.min(4, Math.floor(text.length / 2)); width += 1) {
    if (width > 1 && text[0] === '0') continue;
    const start = Number(text.slice(0, width));
    for (let step = -12; step <= 12; step += 1) {
      if (step === 0) continue;
      let value = start;
      let cursor = 0;
      let terms = 0;

      while (cursor < text.length && terms <= 120) {
        if (value < 0) break;
        const term = String(value);
        if (!text.startsWith(term, cursor)) break;

        cursor += term.length;
        terms += 1;
        value += step;

        if (terms < 3) continue;

        const candidate = {
          start,
          step,
          terms,
          width,
          consumedLength: cursor,
          runModelLog10: arithmeticRunModelLog10({ width, step, terms })
        };

        // Prefer the widest established span. For a tie, prefer more terms,
        // then the smaller absolute step, which is the simpler enumeration.
        if (!best ||
          candidate.consumedLength > best.consumedLength ||
          (candidate.consumedLength === best.consumedLength && candidate.terms > best.terms) ||
          (candidate.consumedLength === best.consumedLength && candidate.terms === best.terms &&
            Math.abs(candidate.step) < Math.abs(best.step))) {
          best = candidate;
        }
      }
    }
  }
  return best;
}

function findNumericSequence(password) {
  let best = null;

  for (const match of password.matchAll(/\d{6,}/gu)) {
    const digitRun = match[0];
    const sequence = isDigitArithmeticSequence(digitRun);
    if (!sequence) continue;
    const index = match.index;
    const spanEnd = index + sequence.consumedLength;
    const candidate = {
      run: digitRun.slice(0, sequence.consumedLength),
      index,
      prefix: password.slice(0, index),
      suffix: password.slice(spanEnd),
      spanStart: index,
      spanEnd,
      ...sequence
    };

    const candidateLength = candidate.spanEnd - candidate.spanStart;
    const bestLength = best ? best.spanEnd - best.spanStart : -1;
    if (!best || candidateLength > bestLength ||
      (candidateLength === bestLength && candidate.terms > best.terms)) {
      best = candidate;
    }
  }

  return best;
}

function readDigits(password, start) {
  let end = start;
  while (end < password.length && /\d/u.test(password[end])) end += 1;
  if (end === start) return null;
  return {
    text: password.slice(start, end),
    value: Number(password.slice(start, end)),
    end
  };
}

function findNumberedRepeatedToken(password) {
  // Detect a local template of the form:
  //   token + n, token + (n + step), token + (n + 2 * step), ...
  // The repeated alphabetic token and the arithmetic counter must both be
  // explicit. This is deliberately not a general word parser.
  const n = password.length;
  if (n < 12) return null;

  let best = null;
  for (let spanStart = 0; spanStart < n; spanStart += 1) {
    if (!/[A-Za-z]/u.test(password[spanStart])) continue;

    let tokenEnd = spanStart;
    while (tokenEnd < n && /[A-Za-z]/u.test(password[tokenEnd])) tokenEnd += 1;
    const token = password.slice(spanStart, tokenEnd);
    if (token.length < 3 || token.length > 32) continue;

    const first = readDigits(password, tokenEnd);
    if (!first || first.text.length > 6 || !Number.isSafeInteger(first.value)) continue;

    const normalized = token.toLocaleLowerCase('en-US');
    const values = [first.value];
    let cursor = first.end;
    let step = null;

    // Preserve the longest arithmetic prefix. A matching token that resumes
    // with an unrelated final number is literal suffix material, not evidence
    // that the already-established local run was independent randomness:
    //   1and2and3and4and1 -> [and2, and3, and4] + literal "and1".
    // This still requires three terms before any structural candidate exists,
    // so gay1gay2gay4 remains rejected.
    while (cursor < n && password.slice(cursor, cursor + token.length).toLocaleLowerCase('en-US') === normalized) {
      const next = readDigits(password, cursor + token.length);
      if (!next || next.text.length > 6 || !Number.isSafeInteger(next.value)) break;

      const nextStep = next.value - values[values.length - 1];
      if (step === null) {
        step = nextStep;
        if (step === 0 || Math.abs(step) > 12) break;
      } else if (nextStep !== step) {
        break;
      }

      values.push(next.value);
      cursor = next.end;

      if (values.length < 3) continue;
      const candidate = {
        token,
        start: values[0],
        step,
        terms: values.length,
        width: first.text.length,
        spanStart,
        spanEnd: cursor
      };

      // Prefer the widest explicit template. For equal spans, prefer more
      // repeated terms so a later suffix cannot displace a fuller explanation.
      const candidateLength = candidate.spanEnd - candidate.spanStart;
      const bestLength = best ? best.spanEnd - best.spanStart : -1;
      if (!best || candidateLength > bestLength ||
        (candidateLength === bestLength && candidate.terms > best.terms)) {
        best = candidate;
      }
    }
  }

  return best;
}

function findRepeatedTokenNumericTemplate(password) {
  // Detect a local template of the form:
  //   token + n1, token + n2, token + n3, ...
  // without requiring n1, n2, n3 to form an arithmetic progression.
  //
  // This is intentionally narrower than a generic repeated-word matcher:
  // the exact same 3+ character token must alternate directly with explicit
  // numeric fields at least three times. The numeric fields remain separately
  // charged by the scoring model, so this is weaker than an arithmetic counter.
  const n = password.length;
  if (n < 12) return null;

  let best = null;
  for (let spanStart = 0; spanStart < n; spanStart += 1) {
    if (!/[A-Za-z]/u.test(password[spanStart])) continue;

    let tokenEnd = spanStart;
    while (tokenEnd < n && /[A-Za-z]/u.test(password[tokenEnd])) tokenEnd += 1;
    const token = password.slice(spanStart, tokenEnd);
    if (token.length < 3 || token.length > 32) continue;

    const first = readDigits(password, tokenEnd);
    if (!first || first.text.length > 6 || !Number.isSafeInteger(first.value)) continue;

    const normalized = token.toLocaleLowerCase('en-US');
    const numbers = [first.text];
    let cursor = first.end;

    while (cursor < n && password.slice(cursor, cursor + token.length).toLocaleLowerCase('en-US') === normalized) {
      const next = readDigits(password, cursor + token.length);
      if (!next || next.text.length > 6 || !Number.isSafeInteger(next.value)) break;
      numbers.push(next.text);
      cursor = next.end;
    }

    if (numbers.length < 3) continue;

    const candidate = {
      token,
      terms: numbers.length,
      numberFields: numbers,
      spanStart,
      spanEnd: cursor
    };

    // Prefer the widest explicit template. For equal spans, prefer more
    // repeated terms so a shorter embedded prefix does not hide the evidence.
    const candidateLength = candidate.spanEnd - candidate.spanStart;
    const bestLength = best ? best.spanEnd - best.spanStart : -1;
    if (!best || candidateLength > bestLength ||
      (candidateLength === bestLength && candidate.terms > best.terms)) {
      best = candidate;
    }
  }

  return best;
}

function findPeriodicPrefix(password) {
  const n = password.length;
  if (n < 9) return null;

  for (let period = 1; period <= Math.floor(n / 1.75); period += 1) {
    if (period < 3) continue;
    let matches = true;
    for (let i = period; i < n; i += 1) {
      if (password[i] !== password[i % period]) {
        matches = false;
        break;
      }
    }
    if (matches && n / period >= 1.75) {
      return {
        root: password.slice(0, period),
        period,
        repeats: n / period,
        truncated: n % period !== 0,
        spanStart: 0,
        spanEnd: n
      };
    }
  }
  return null;
}

function findLocalTruncatedPeriodicSpan(password) {
  const n = password.length;
  if (n < 9) return null;

  // Find an adjacent repeated root that may be cut short before unrelated
  // trailing material. This is deliberately a local span:
  //   prefix + root + rootPrefix + suffix
  // That makes `flareonflareo13141516` parse as a truncated repeat followed
  // by an independent numeric sequence, rather than requiring the whole
  // password to be periodic.
  //
  // Requiring a 4+ character copied prefix and at least 60% of the root
  // avoids treating a tiny accidental shared start as a repeat.
  // A local suffix can be as short as one character. The precise inner
  // bounds below enforce root + copied prefix; dividing by two here would
  // incorrectly skip `flareonflareo2` because the trailing `2` is not part
  // of the repeated span.
  const maxRootLength = Math.min(24, n - 4);
  for (let rootLength = maxRootLength; rootLength >= 4; rootLength -= 1) {
    const minContinuation = Math.max(4, Math.ceil(rootLength * 0.6));
    for (let firstStart = 0; firstStart + rootLength + minContinuation <= n; firstStart += 1) {
      const root = password.slice(firstStart, firstStart + rootLength);
      const remaining = n - (firstStart + rootLength);
      const maxContinuation = Math.min(rootLength, remaining);

      for (let continuationLength = maxContinuation; continuationLength >= minContinuation; continuationLength -= 1) {
        const secondStart = firstStart + rootLength;
        const secondEnd = secondStart + continuationLength;
        if (password.slice(secondStart, secondEnd) !== root.slice(0, continuationLength)) continue;

        // The whole-password periodic detector already gives the clearer
        // explanation when this exact span consumes the entire password.
        if (firstStart === 0 && secondEnd === n) continue;

        return {
          prefix: password.slice(0, firstStart),
          root,
          continuation: password.slice(secondStart, secondEnd),
          suffix: password.slice(secondEnd),
          rootLength,
          continuationLength,
          truncated: continuationLength < rootLength,
          spanStart: firstStart,
          spanEnd: secondEnd
        };
      }
    }
  }
  return null;
}

function findRepeatedOuterChunk(password) {
  const n = password.length;
  if (n < 9) return null;

  // password = root + bridge + root. The copies must be non-overlapping and
  // occupy most of the value, avoiding a short accidental shared edge.
  for (let rootLength = Math.floor((n - 1) / 2); rootLength >= 4; rootLength -= 1) {
    const root = password.slice(0, rootLength);
    const bridge = password.slice(rootLength, n - rootLength);
    const suffix = password.slice(n - rootLength);
    if (root !== suffix || bridge.length === 0) continue;
    if ((2 * rootLength) / n < 0.6) continue;
    return { root, bridge, rootLength, spanStart: 0, spanEnd: n };
  }
  return null;
}

function findEmbeddedRepeatedChunk(password) {
  const n = password.length;
  if (n < 13) return null;

  // Detect a repeated nontrivial chunk with a short bridge anywhere in the
  // password, not solely at the terminal boundary:
  //   prefix + root + bridge + root + suffix
  // The structural span is only root + bridge + root; prefix/suffix remain
  // independently scoreable. That is what allows this rule to compose with,
  // for example, a deterministic numeric suffix.
  //
  // firstStart begins at 1 because an exact root + bridge + root construction
  // is handled by findRepeatedOuterChunk with a slightly lower layout cost.
  const maxRootLength = Math.min(24, Math.floor((n - 2) / 2));
  for (let rootLength = maxRootLength; rootLength >= 6; rootLength -= 1) {
    for (let firstStart = 1; firstStart + (2 * rootLength) + 1 <= n; firstStart += 1) {
      const root = password.slice(firstStart, firstStart + rootLength);
      for (let bridgeLength = 1; bridgeLength <= 4; bridgeLength += 1) {
        const secondStart = firstStart + rootLength + bridgeLength;
        const secondEnd = secondStart + rootLength;
        if (secondEnd > n) continue;
        if (password.slice(secondStart, secondEnd) !== root) continue;
        const localLength = 2 * rootLength + bridgeLength;
        if ((2 * rootLength) / localLength < 0.7) continue;
        return {
          prefix: password.slice(0, firstStart),
          root,
          bridge: password.slice(firstStart + rootLength, secondStart),
          suffix: password.slice(secondEnd),
          rootLength,
          spanStart: firstStart,
          spanEnd: secondEnd
        };
      }
    }
  }
  return null;
}

const MIN_INTERLEAVED_SPAN_LENGTH = 10;
const MIN_INTERLEAVED_STREAM_LENGTH = 4;
const MAX_INTERLEAVED_STREAM_TAIL = 2;
const INTERLEAVE_LAYOUT_LOG10 = 1.2;

function monotoneAlpha(stream) {
  if (stream.length < 4 || !/^[A-Za-z]+$/u.test(stream)) return false;
  const codes = [...stream.toLowerCase()].map((ch) => ch.charCodeAt(0));
  const delta = codes[1] - codes[0];
  if (Math.abs(delta) !== 1) return false;
  return codes.every((code, index) => index === 0 || code - codes[index - 1] === delta);
}

function monotoneDigits(stream) {
  if (stream.length < 4 || !/^\d+$/u.test(stream)) return false;
  const digits = [...stream].map(Number);
  const delta = digits[1] - digits[0];
  if (Math.abs(delta) !== 1) return false;
  return digits.every((digit, index) => index === 0 || digit - digits[index - 1] === delta);
}

function isSimpleStream(stream) {
  const constant = stream.length >= 4 && [...stream].every((ch) => ch === stream[0]);
  return constant || monotoneAlpha(stream) || monotoneDigits(stream);
}

function deinterleave(span) {
  let first = '';
  let second = '';
  for (let index = 0; index < span.length; index += 1) {
    if (index % 2 === 0) first += span[index];
    else second += span[index];
  }
  return { first, second };
}

function recognizedPrefix(stream, score) {
  const sequence = Array.isArray(score?.sequence) ? score.sequence : [];
  if (!sequence.length) return null;

  // The general detector uses zxcvbn's selected parse. A recovered stream is
  // eligible only when it is entirely non-generic apart from a very short
  // terminal literal tail. This prevents two unrelated alternating strings
  // from being relabelled as an interleaving merely because they split in two.
  let cursor = 0;
  for (let index = 0; index < sequence.length; index += 1) {
    const piece = sequence[index];
    if (piece.i !== cursor) return null;
    if (piece.pattern === 'bruteforce') {
      if (index !== sequence.length - 1) return null;
      const tailLength = stream.length - cursor;
      if (tailLength > MAX_INTERLEAVED_STREAM_TAIL) return null;
      break;
    }
    cursor = piece.j + 1;
  }

  const tailLength = stream.length - cursor;
  const core = stream.slice(0, cursor);
  if (core.length < MIN_INTERLEAVED_STREAM_LENGTH) return null;
  return { core, tailLength };
}

function findScoredInterleavedPrefix(password, scoreSegment) {
  if (typeof scoreSegment !== 'function' || password.length < MIN_INTERLEAVED_SPAN_LENGTH) return null;

  const scoreCache = new Map();
  const scoreCached = (text) => {
    if (!scoreCache.has(text)) scoreCache.set(text, scoreSegment(text));
    return scoreCache.get(text);
  };

  // Score only the full two recovered streams, then (at most) their recovered
  // cores. This keeps this general detector bounded rather than rescoring every
  // possible substring pair. A bounded residue at the end remains literal.
  const full = deinterleave(password);
  const firstPrefix = recognizedPrefix(full.first, scoreCached(full.first));
  const secondPrefix = recognizedPrefix(full.second, scoreCached(full.second));
  if (!firstPrefix || !secondPrefix) return null;

  let trim = 0;
  const maxTrim = firstPrefix.tailLength + secondPrefix.tailLength;
  for (let candidate = 1; candidate <= maxTrim; candidate += 1) {
    const coreSpan = password.slice(0, password.length - candidate);
    if (coreSpan.length < MIN_INTERLEAVED_SPAN_LENGTH) break;
    const core = deinterleave(coreSpan);
    if (core.first === firstPrefix.core && core.second === secondPrefix.core) trim = candidate;
  }

  const spanEnd = password.length - trim;
  const span = password.slice(0, spanEnd);
  const { first, second } = deinterleave(span);
  if (first.length < MIN_INTERLEAVED_STREAM_LENGTH || second.length < MIN_INTERLEAVED_STREAM_LENGTH) return null;

  const firstLog10 = segmentLog10(scoreCached, first);
  const secondLog10 = segmentLog10(scoreCached, second);
  const streamModelLog10 = firstLog10 + secondLog10 + INTERLEAVE_LAYOUT_LOG10;
  const spanLog10 = segmentLog10(scoreCached, span);

  // The construction must beat zxcvbn's ordinary score for the same contiguous
  // span by a material amount. The fixed 1.2-log layout cost covers choosing an
  // alternating layout instead of treating the two streams as one free parse.
  if (!(streamModelLog10 + 0.75 < spanLog10)) return null;

  return {
    first,
    second,
    firstLog10,
    secondLog10,
    spanStart: 0,
    spanEnd,
    candidateLog10: streamModelLog10,
    scorerAware: true
  };
}

function findSimpleInterleavedStructure(password) {
  if (password.length < MIN_INTERLEAVED_SPAN_LENGTH) return null;

  // Retain the prior deterministic local rule. It preserves simple spans with
  // unrelated material on either side, including callers of detectStructure()
  // that intentionally do not supply a zxcvbn scorer.
  let best = null;
  for (let spanStart = 0; spanStart <= password.length - MIN_INTERLEAVED_SPAN_LENGTH; spanStart += 1) {
    for (let spanEnd = password.length; spanEnd >= spanStart + MIN_INTERLEAVED_SPAN_LENGTH; spanEnd -= 1) {
      const span = password.slice(spanStart, spanEnd);
      for (const offset of [0, 1]) {
        const first = [...span].filter((_, index) => index % 2 === offset).join('');
        const second = [...span].filter((_, index) => index % 2 !== offset).join('');
        if (!isSimpleStream(first) || !isSimpleStream(second)) continue;

        const candidate = { first, second, spanStart, spanEnd, candidateLog10: null, scorerAware: false };
        const candidateLength = candidate.spanEnd - candidate.spanStart;
        const bestLength = best ? best.spanEnd - best.spanStart : -1;
        if (!best || candidateLength > bestLength ||
          (candidateLength === bestLength && candidate.spanStart < best.spanStart)) {
          best = candidate;
        }
      }
    }
  }
  return best;
}

function findInterleavedStructure(password, scoreSegment) {
  return findScoredInterleavedPrefix(password, scoreSegment) || findSimpleInterleavedStructure(password);
}

function attachSource(detections, password) {
  for (const detection of detections) {
    Object.defineProperty(detection, '_password', {
      value: password,
      enumerable: false,
      configurable: false
    });
  }
  return detections;
}

function detectStructure(password, scoreSegment) {
  const detections = [];
  const numeric = findNumericSequence(password);
  if (numeric) {
    detections.push({
      id: 'concatenated-numeric-sequence',
      severity: 'high',
      title: 'Concatenated arithmetic sequence',
      detail: `The numeric run is ${numeric.terms} values beginning at ${numeric.start} with step ${numeric.step}. It is a local span, so its estimate can compose with a separate detector elsewhere in the password.`,
      run: numeric.run,
      prefix: numeric.prefix,
      suffix: numeric.suffix,
      start: numeric.start,
      step: numeric.step,
      terms: numeric.terms,
      width: numeric.width,
      runModelLog10: numeric.runModelLog10,
      spanStart: numeric.spanStart,
      spanEnd: numeric.spanEnd,
      capLog10: null
    });
  }

  const numberedRepeat = findNumberedRepeatedToken(password);
  if (numberedRepeat) {
    detections.push({
      id: 'numbered-repeated-token-sequence',
      severity: 'high',
      title: 'Repeated token with arithmetic counter',
      detail: `The token “${numberedRepeat.token}” repeats ${numberedRepeat.terms} times with numbers beginning at ${numberedRepeat.start} and step ${numberedRepeat.step}. The token and counter are chosen once, rather than independently for every copy.`,
      root: numberedRepeat.token,
      start: numberedRepeat.start,
      step: numberedRepeat.step,
      terms: numberedRepeat.terms,
      width: numberedRepeat.width,
      spanStart: numberedRepeat.spanStart,
      spanEnd: numberedRepeat.spanEnd,
      capLog10: null
    });
  }

  const numberedTemplate = findRepeatedTokenNumericTemplate(password);
  if (numberedTemplate) {
    detections.push({
      id: 'repeated-token-numeric-template',
      severity: 'medium',
      title: 'Repeated token with variable numbers',
      detail: `The token “${numberedTemplate.token}” repeats ${numberedTemplate.terms} times in an explicit token-number template. Its numeric fields are still charged individually because they do not form one arithmetic counter.`,
      root: numberedTemplate.token,
      terms: numberedTemplate.terms,
      numberFields: numberedTemplate.numberFields,
      spanStart: numberedTemplate.spanStart,
      spanEnd: numberedTemplate.spanEnd,
      capLog10: null
    });
  }

  const periodic = findPeriodicPrefix(password);
  if (periodic) {
    detections.push({
      id: 'periodic-or-truncated-repeat',
      severity: 'medium',
      title: periodic.truncated ? 'Truncated repeated root' : 'Repeated root',
      detail: `The password is ${periodic.repeats.toFixed(2)} repeats of a ${periodic.period}-character root${periodic.truncated ? ', with the final repeat cut short' : ''}.`,
      root: periodic.root,
      spanStart: periodic.spanStart,
      spanEnd: periodic.spanEnd,
      capLog10: null
    });
  }

  const localPeriodic = findLocalTruncatedPeriodicSpan(password);
  if (localPeriodic) {
    detections.push({
      id: 'local-periodic-or-truncated-repeat',
      severity: 'high',
      title: localPeriodic.truncated ? 'Local truncated repeated root' : 'Local repeated root',
      detail: `A ${localPeriodic.rootLength}-character root is immediately repeated${localPeriodic.truncated ? ` with its second copy cut to ${localPeriodic.continuationLength} characters` : ''}. Text after this local span is scored separately, so the reuse can compose with another detector.`,
      root: localPeriodic.root,
      continuation: localPeriodic.continuation,
      truncated: localPeriodic.truncated,
      spanStart: localPeriodic.spanStart,
      spanEnd: localPeriodic.spanEnd,
      capLog10: null
    });
  }

  const repeatedOuter = findRepeatedOuterChunk(password);
  if (repeatedOuter) {
    detections.push({
      id: 'repeated-prefix-suffix',
      severity: 'high',
      title: 'Repeated outer chunk',
      detail: `The first and last ${repeatedOuter.rootLength} characters are the same exact chunk, with a ${repeatedOuter.bridge.length}-character insertion between them. Repeating that chunk does not add fresh entropy.`,
      root: repeatedOuter.root,
      bridge: repeatedOuter.bridge,
      spanStart: repeatedOuter.spanStart,
      spanEnd: repeatedOuter.spanEnd,
      capLog10: null
    });
  }

  const embedded = findEmbeddedRepeatedChunk(password);
  if (embedded) {
    detections.push({
      id: 'embedded-repeated-chunk',
      severity: 'medium',
      title: 'Reused internal chunk',
      detail: `A ${embedded.rootLength}-character chunk occurs twice with only a ${embedded.bridge.length}-character bridge. Text before and after this local span is scored separately, so this reuse can combine with another independent structural finding.`,
      prefix: embedded.prefix,
      root: embedded.root,
      bridge: embedded.bridge,
      suffix: embedded.suffix,
      spanStart: embedded.spanStart,
      spanEnd: embedded.spanEnd,
      capLog10: null
    });
  }

  const interleaved = findInterleavedStructure(password, scoreSegment);
  if (interleaved) {
    const scorerAware = interleaved.scorerAware === true;
    detections.push({
      id: 'interleaved-structured-streams',
      severity: 'medium',
      title: scorerAware ? 'Interleaved predictable streams' : 'Interleaved simple streams',
      detail: scorerAware
        ? `Every-other-character streams “${interleaved.first}” and “${interleaved.second}” each have a lower-cost zxcvbn parse. Their scores are charged independently with a fixed interleaving-layout cost.`
        : 'Every-other-character streams are each constant or monotone. This catches constructions like 1a1b1c1d… that do not look like one ordinary sequence.',
      first: interleaved.first,
      second: interleaved.second,
      scorerAware,
      spanStart: interleaved.spanStart,
      spanEnd: interleaved.spanEnd,
      capLog10: scorerAware ? null : 5.2
    });
  }

  return attachSource(detections, password);
}

function buildLocalOption(detection, scoreSegment) {
  let cost = detection.capLog10;

  if (detection.id === 'concatenated-numeric-sequence') {
    cost = detection.runModelLog10;
    detection.sequenceModelLog10 = cost;
    detection.structuralCandidateLog10 = cost;
  }

  if (detection.id === 'numbered-repeated-token-sequence') {
    const rootLog10 = segmentLog10(scoreSegment, detection.root);
    // Choosing the root once plus the compact arithmetic-counter model is
    // cheaper than choosing each token-number block independently. The
    // numeric model includes start, step, term-count, and construction cost.
    cost = rootLog10 + arithmeticRunModelLog10({
      width: detection.width,
      step: detection.step,
      terms: detection.terms
    });
    detection.rootBaselineLog10 = rootLog10;
    detection.sequenceModelLog10 = cost - rootLog10;
    detection.structuralCandidateLog10 = cost;
  }

  if (detection.id === 'repeated-token-numeric-template') {
    const rootLog10 = segmentLog10(scoreSegment, detection.root);
    const numberFieldLog10 = detection.numberFields
      .map((field) => segmentLog10(scoreSegment, field));
    const numericFieldsLog10 = numberFieldLog10.reduce((total, cost) => total + cost, 0);

    // Preserve each separately chosen numeric field, then charge a bounded
    // token-number-template choice. This deliberately stays costlier than
    // the arithmetic-counter model, which can encode start + step + length.
    const templateLog10 = log10(Math.max(32, detection.terms * 16)) + 0.25;
    cost = rootLog10 + numericFieldsLog10 + templateLog10;
    detection.rootBaselineLog10 = rootLog10;
    detection.numberFieldBaselineLog10 = numberFieldLog10;
    detection.numericFieldsBaselineLog10 = numericFieldsLog10;
    detection.templateModelLog10 = templateLog10;
    detection.structuralCandidateLog10 = cost;
  }

  if (detection.id === 'interleaved-structured-streams' && detection.scorerAware) {
    const firstLog10 = segmentLog10(scoreSegment, detection.first);
    const secondLog10 = segmentLog10(scoreSegment, detection.second);
    cost = firstLog10 + secondLog10 + INTERLEAVE_LAYOUT_LOG10;
    detection.firstStreamBaselineLog10 = firstLog10;
    detection.secondStreamBaselineLog10 = secondLog10;
    detection.interleaveLayoutLog10 = INTERLEAVE_LAYOUT_LOG10;
    detection.structuralCandidateLog10 = cost;
  }

  if (detection.id === 'periodic-or-truncated-repeat') {
    const rootLog10 = segmentLog10(scoreSegment, detection.root);
    cost = rootLog10 + log10(Math.max(8, detection.root.length * 8));
    detection.rootBaselineLog10 = rootLog10;
    detection.structuralCandidateLog10 = cost;
  }

  if (detection.id === 'local-periodic-or-truncated-repeat') {
    const rootLog10 = segmentLog10(scoreSegment, detection.root);
    // Pay for choosing the root once and for the decision to repeat/truncate
    // it. The duplicated material itself contributes no independent entropy.
    cost = rootLog10 + log10(Math.max(8, detection.root.length * 8));
    detection.rootBaselineLog10 = rootLog10;
    detection.structuralCandidateLog10 = cost;
  }

  if (detection.id === 'repeated-prefix-suffix') {
    const rootLog10 = segmentLog10(scoreSegment, detection.root);
    const bridgeLog10 = segmentLog10(scoreSegment, detection.bridge);
    cost = rootLog10 + bridgeLog10 + log10(16);
    detection.rootBaselineLog10 = rootLog10;
    detection.bridgeBaselineLog10 = bridgeLog10;
    detection.structuralCandidateLog10 = cost;
  }

  if (detection.id === 'embedded-repeated-chunk') {
    const rootLog10 = segmentLog10(scoreSegment, detection.root);
    const bridgeLog10 = segmentLog10(scoreSegment, detection.bridge);
    // This span is root + bridge + root. The first root and bridge are paid
    // once; the second root is reused. Prefix/suffix stay outside this local
    // model and are charged by the composition pass.
    cost = rootLog10 + bridgeLog10 + log10(32);
    detection.rootBaselineLog10 = rootLog10;
    detection.bridgeBaselineLog10 = bridgeLog10;
    detection.structuralCandidateLog10 = cost;
  }

  if (!Number.isFinite(cost)) return null;
  if (!Number.isInteger(detection.spanStart) || !Number.isInteger(detection.spanEnd)) return null;
  return {
    id: detection.id,
    title: detection.title,
    start: detection.spanStart,
    end: detection.spanEnd,
    cost
  };
}

function nonOverlapping(options) {
  let end = -1;
  for (const option of options) {
    if (option.start < end) return false;
    end = option.end;
  }
  return true;
}

function scoreCompositeParse(password, options, scoreSegment) {
  let cursor = 0;
  let total = 0;
  const pieces = [];

  for (const option of options) {
    const literal = password.slice(cursor, option.start);
    if (literal.length) {
      const cost = segmentLog10(scoreSegment, literal);
      total += cost;
      pieces.push({ type: 'literal', start: cursor, end: option.start, cost });
    }
    total += option.cost;
    pieces.push({ type: 'structure', id: option.id, start: option.start, end: option.end, cost: option.cost });
    cursor = option.end;
  }

  const suffix = password.slice(cursor);
  if (suffix.length) {
    const cost = segmentLog10(scoreSegment, suffix);
    total += cost;
    pieces.push({ type: 'literal', start: cursor, end: password.length, cost });
  }

  return { total, pieces };
}

function applyStructuralCaps(baselineLog10, detections, scoreSegment) {
  const password = detections[0]?._password;
  if (!password) {
    return { effectiveLog10: baselineLog10, adjustments: [], composition: null };
  }

  // Both local detector models and the final parse may need the same short
  // segment. Cache zxcvbn calls by exact segment so combining detectors does
  // not multiply the local runtime.
  const scoreCache = new Map();
  const scoreCached = (segment) => {
    if (!scoreCache.has(segment)) scoreCache.set(segment, scoreSegment(segment));
    return scoreCache.get(segment);
  };

  const options = detections
    .map((detection) => ({ detection, option: buildLocalOption(detection, scoreCached) }))
    .filter(({ option }) => option && option.start >= 0 && option.end > option.start && option.end <= password.length);

  let best = {
    score: baselineLog10,
    options: [],
    pieces: []
  };

  // There is a small fixed set of narrow detector families. Enumerating
  // their subsets is cheaper and easier to inspect than a general parser,
  // while allowing every non-overlapping structural span to be used together.
  const optionCount = options.length;
  for (let mask = 1; mask < (1 << optionCount); mask += 1) {
    const selected = [];
    for (let bit = 0; bit < optionCount; bit += 1) {
      if (mask & (1 << bit)) selected.push(options[bit]);
    }
    selected.sort((a, b) => a.option.start - b.option.start || a.option.end - b.option.end);
    const spans = selected.map(({ option }) => option);
    if (!nonOverlapping(spans)) continue;

    const parsed = scoreCompositeParse(password, spans, scoreCached);
    // For ties, keep the more explanatory parse so the UI can show all
    // independent structures responsible for the result.
    if (parsed.total < best.score - 1e-9 ||
      (Math.abs(parsed.total - best.score) <= 1e-9 && spans.length > best.options.length)) {
      best = { score: parsed.total, options: spans, pieces: parsed.pieces };
    }
  }

  const selectedIds = new Set(best.options.map((option) => option.id));
  for (const { detection } of options) {
    detection.selectedInComposite = selectedIds.has(detection.id);
  }

  const adjustments = best.options.length && best.score < baselineLog10
    ? [{
      detector: best.options.length === 1 ? best.options[0].id : 'composed-structural-parse',
      from: baselineLog10,
      to: best.score,
      detectors: best.options.map((option) => option.id)
    }]
    : [];

  return {
    effectiveLog10: best.score,
    adjustments,
    composition: best.options.length ? {
      detectorIds: best.options.map((option) => option.id),
      detectorTitles: best.options.map((option) => option.title),
      candidateLog10: best.score,
      pieces: best.pieces
    } : null
  };
}

module.exports = {
  detectStructure,
  applyStructuralCaps,
  arithmeticRunModelLog10,
  isDigitArithmeticSequence,
  findNumberedRepeatedToken,
  findRepeatedTokenNumericTemplate
};

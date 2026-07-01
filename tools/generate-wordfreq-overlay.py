#!/usr/bin/env python3
"""Generate the bundled ranked English overlay from Python's wordfreq package.

This script is intentionally optional: the generated JSON is checked into the
zip so `npm ci && npm start` needs only Node. It uses wordfreq's ordered large
English list, not a binary spell-check dictionary, because zxcvbn needs ranks.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

TOKEN = re.compile(r"[a-z][a-z0-9'-]{2,31}\Z")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=250_000)
    parser.add_argument('--output', type=Path, default=Path('data/wordfreq-en-2021.json'))
    args = parser.parse_args()

    try:
        from wordfreq import top_n_list
    except ImportError as exc:
        raise SystemExit('Install Python wordfreq first: python -m pip install wordfreq') from exc

    seen: set[str] = set()
    entries: list[str] = []
    for raw in top_n_list('en', args.limit):
        token = raw.strip().lower()
        if not TOKEN.fullmatch(token) or token in seen:
            continue
        seen.add(token)
        entries.append(token)

    payload = {
        'schemaVersion': 1,
        'source': 'wordfreq large English list',
        'sourceProject': 'https://github.com/rspeer/wordfreq',
        'dataSnapshot': 'language usage through about 2021 (per upstream project)',
        'extraction': f"top_n_list('en', {args.limit}) filtered to 3–32 character ASCII-like password tokens; preserved order is the local rank order",
        'entryCount': len(entries),
        'entries': entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, separators=(',', ':')), encoding='utf-8')
    print(f'wrote {len(entries):,} ranked tokens to {args.output}')


if __name__ == '__main__':
    main()

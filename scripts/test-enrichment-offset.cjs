const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectBatch } = require('./test-enrichment.js');

test('offset batches preserve order without mutating input', () => {
    const records = Object.freeze(Array.from({ length: 45 }, (_, index) => index));
    const batches = [0, 20, 40].map(offset => selectBatch(records, [`--offset=${offset}`, '--limit=20']));
    assert.deepEqual(batches.map(batch => batch.offset), [0, 20, 40]);
    assert.deepEqual(batches.map(batch => batch.records.length), [20, 20, 5]);
    assert.deepEqual(batches.flatMap(batch => batch.records), [...records]);
    assert.deepEqual(selectBatch(records, ['--offset=50']).records, []);
    assert.equal(selectBatch(records, []).offset, 0);
});

test('offset must be non-negative integer; limit stays within 1–20', () => {
    for (const value of ['-1', '1.5', 'NaN', '', 'Infinity', '9007199254740992']) {
        assert.throws(() => selectBatch([], [`--offset=${value}`]));
    }
    for (const value of ['0', '21', '-1', '1.5', '']) {
        assert.throws(() => selectBatch([], [`--limit=${value}`]));
    }
    assert.equal(selectBatch([1, 2], ['--limit=1']).records.length, 1);
});

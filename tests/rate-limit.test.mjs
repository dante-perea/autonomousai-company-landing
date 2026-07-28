import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforceApplicationRateLimit } from '../server/rate-limit.mjs';

function memoryD1() {
  const attempts = new Map();
  const preparedStatements = [];

  const database = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async run() {
          return { success: true };
        },
        async first() {
          assert.match(sql, /INSERT INTO application_rate_limits/);
          const key = this.values.join(':');
          const next = (attempts.get(key) || 0) + 1;
          attempts.set(key, next);
          return { attempts: next };
        },
      };
      preparedStatements.push({ sql, statement });
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };

  return { database, attempts, preparedStatements };
}

test('allows three attempts per hashed address and blocks the fourth', async () => {
  const d1 = memoryD1();
  const request = {
    database: d1.database,
    salt: 'test-rate-limit-salt',
    clientAddress: '203.0.113.7',
    now: new Date('2026-07-28T09:07:00.000Z'),
  };

  const results = [];
  for (let index = 0; index < 4; index += 1) {
    results.push(await enforceApplicationRateLimit(request));
  }

  assert.deepEqual(
    results.map(({ allowed, attempts }) => ({ allowed, attempts })),
    [
      { allowed: true, attempts: 1 },
      { allowed: true, attempts: 2 },
      { allowed: true, attempts: 3 },
      { allowed: false, attempts: 4 },
    ],
  );
  assert.equal(results[3].retryAfterSeconds, 480);
  assert.equal([...d1.attempts.keys()].some((key) => key.includes('203.0.113.7')), false);
});

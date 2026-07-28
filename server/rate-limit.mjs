const WINDOW_MILLISECONDS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 3;
const RETENTION_MILLISECONDS = 24 * 60 * 60 * 1_000;

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS application_rate_limits (
    address_hash TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (address_hash, window_start)
  )
`;

const CREATE_WINDOW_INDEX = `
  CREATE INDEX IF NOT EXISTS application_rate_limits_window_idx
  ON application_rate_limits (window_start)
`;

const UPSERT_ATTEMPT = `
  INSERT INTO application_rate_limits (address_hash, window_start, attempts)
  VALUES (?, ?, 1)
  ON CONFLICT(address_hash, window_start)
  DO UPDATE SET attempts = attempts + 1
  RETURNING attempts
`;

let schemaReady;

async function hashAddress(address, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${address}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function ensureSchema(database) {
  if (!schemaReady) {
    schemaReady = database
      .batch([
        database.prepare(CREATE_TABLE),
        database.prepare(CREATE_WINDOW_INDEX),
      ])
      .catch((error) => {
        schemaReady = undefined;
        throw error;
      });
  }
  await schemaReady;
}

export async function enforceApplicationRateLimit({
  database,
  salt,
  clientAddress,
  now = new Date(),
}) {
  if (!database || !salt || !clientAddress) {
    throw new Error('Application rate limiting is not configured.');
  }

  await ensureSchema(database);

  const nowMilliseconds = now.getTime();
  const windowStart =
    Math.floor(nowMilliseconds / WINDOW_MILLISECONDS) * WINDOW_MILLISECONDS;
  const addressHash = await hashAddress(clientAddress, salt);

  await database
    .prepare('DELETE FROM application_rate_limits WHERE window_start < ?')
    .bind(nowMilliseconds - RETENTION_MILLISECONDS)
    .run();

  const result = await database
    .prepare(UPSERT_ATTEMPT)
    .bind(addressHash, windowStart)
    .first();
  const attempts = Number(result?.attempts || 0);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStart + WINDOW_MILLISECONDS - nowMilliseconds) / 1_000),
  );

  return {
    allowed: attempts > 0 && attempts <= MAX_ATTEMPTS,
    attempts,
    retryAfterSeconds,
  };
}

import crypto from 'node:crypto';

// scrypt: memory-hard, in Node's standard library (no native modules to rebuild for Electron)
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

const scrypt = (pin, salt, params) => new Promise((resolve, reject) => {
  crypto.scrypt(pin, salt, params.keylen, { N: params.N, r: params.r, p: params.p }, (err, key) => {
    if (err) reject(err); else resolve(key);
  });
});

export function isValidPinFormat(pin) {
  return typeof pin === 'string' && /^\d{4,16}$/.test(pin);
}

// -> { v, salt, hash, N, r, p, keylen } (hex strings). The PIN itself is never stored.
export async function createPinRecord(pin) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pin, salt, PARAMS);
  return { v: 1, salt: salt.toString('hex'), hash: key.toString('hex'), ...PARAMS };
}

export async function verifyPin(pin, record) {
  if (typeof pin !== 'string' || !record || typeof record.salt !== 'string' || typeof record.hash !== 'string') return false;
  try {
    const params = { N: record.N, r: record.r, p: record.p, keylen: record.keylen };
    const expected = Buffer.from(record.hash, 'hex');
    const actual = await scrypt(pin, Buffer.from(record.salt, 'hex'), params);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

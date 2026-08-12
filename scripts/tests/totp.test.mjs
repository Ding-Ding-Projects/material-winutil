import assert from 'node:assert/strict';
import test from 'node:test';

const totp = await import(new URL('../../dist/shared/totp.js', import.meta.url));

test('RFC 4226 HOTP vectors pass', () => {
  const secret = new TextEncoder().encode('12345678901234567890');
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  expected.forEach((token, counter) => {
    assert.equal(totp.generateHotp(secret, { counter, digits: 6, algorithm: 'SHA1' }), token);
  });
});

test('RFC 6238 TOTP vectors pass for SHA-1, SHA-256, and SHA-512', () => {
  const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
  const vectors = [
    ['SHA1', '12345678901234567890', ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130']],
    ['SHA256', '12345678901234567890123456789012', ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706']],
    ['SHA512', '1234567890123456789012345678901234567890123456789012345678901234', ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826']],
  ];
  for (const [algorithm, secretText, expected] of vectors) {
    const secret = new TextEncoder().encode(secretText);
    times.forEach((timestamp, index) => {
      assert.equal(totp.generateTotp(secret, { timestampMs: timestamp * 1000, period: 30, digits: 8, algorithm }), expected[index]);
    });
  }
});

test('base32 encoding round trips and rejects ambiguous or non-canonical input', () => {
  const bytes = new TextEncoder().encode('hello world');
  assert.equal(totp.base32Encode(bytes), 'NBSWY3DPEB3W64TMMQ');
  assert.deepEqual(totp.base32Decode('NBSWY3DPEB3W64TMMQ======'), bytes);
  assert.deepEqual(totp.base32Decode('nbswy3dpeb3w64tmmq'), bytes);
  assert.throws(() => totp.base32Decode('NBSW Y3DP'), /whitespace/);
  assert.throws(() => totp.base32Decode('NBSWY3D1'), /invalid character/);
  assert.throws(() => totp.base32Decode('AB'), /trailing bits/);
  assert.throws(() => totp.base32Decode('A'), /impossible encoded length/);
});

test('TOTP verification is bounded, constant-shape, and reports the matched counter offset', () => {
  const secret = new TextEncoder().encode('12345678901234567890');
  const token = totp.generateTotp(secret, { timestampMs: 90_000 });
  assert.equal(totp.verifyTotp(token, secret, { timestampMs: 120_000, window: 1 }), -1);
  assert.equal(totp.verifyTotp('000000', secret, { timestampMs: 120_000, window: 1 }), null);
  assert.equal(totp.verifyTotp('12345x', secret), null);
  assert.throws(() => totp.verifyTotp(token, secret, { window: 11 }), /window/);
});

test('otpauth URI builder and parser preserve bounded standard fields', () => {
  const uri = totp.buildTotpUri({
    account: 'user@example.com',
    issuer: 'Material Utility',
    secret: new TextEncoder().encode('12345678901234567890'),
    algorithm: 'SHA256',
    digits: 8,
    period: 45,
  });
  const parsed = totp.parseTotpUri(uri);
  assert.equal(parsed.label, 'Material Utility:user@example.com');
  assert.equal(parsed.account, 'user@example.com');
  assert.equal(parsed.issuer, 'Material Utility');
  assert.equal(parsed.algorithm, 'SHA256');
  assert.equal(parsed.digits, 8);
  assert.equal(parsed.period, 45);
  assert.equal(new TextDecoder().decode(parsed.secret), '12345678901234567890');
});

test('otpauth parsing fails closed on malformed, duplicate, mismatched, or unbounded fields', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  assert.throws(() => totp.parseTotpUri(`https://totp/Test?secret=${secret}`), /otpauth TOTP/);
  assert.throws(() => totp.parseTotpUri(`otpauth://hotp/Test?secret=${secret}`), /otpauth TOTP/);
  assert.throws(() => totp.parseTotpUri(`otpauth://totp/Alice?secret=${secret}&secret=${secret}`), /duplicate/);
  assert.throws(() => totp.parseTotpUri(`otpauth://totp/Issuer%20A:Alice?secret=${secret}&issuer=Issuer+B`), /must match/);
  assert.throws(() => totp.parseTotpUri(`otpauth://totp/Alice?secret=${secret}&digits=9`), /digits/);
  assert.throws(() => totp.parseTotpUri(`otpauth://totp/Alice?secret=${secret}&period=0`), /period/);
  assert.throws(() => totp.parseTotpUri(`otpauth://totp/Alice?secret=${secret}&image=x`), /unsupported/);
  assert.throws(() => totp.buildTotpUri({ account: 'x'.repeat(129), secret }), /account/);
});

test('numeric inputs reject unsafe counters, invalid periods, and unsupported algorithms', () => {
  const secret = new Uint8Array([1]);
  assert.throws(() => totp.generateHotp(secret, { counter: Number.MAX_SAFE_INTEGER + 1 }), /counter/);
  assert.throws(() => totp.generateHotp(secret, { counter: Number.POSITIVE_INFINITY }), /counter/);
  assert.throws(() => totp.generateHotp(secret, { counter: 1.5 }), /counter/);
  assert.throws(() => totp.generateHotp(secret, { counter: -1 }), /counter/);
  assert.throws(() => totp.generateTotp(secret, { period: 0 }), /period/);
  assert.throws(() => totp.generateTotp(secret, { algorithm: 'MD5' }), /algorithm/);
  assert.throws(() => totp.generateTotp(secret, { timestampMs: Number.NaN }), /timestampMs/);
  assert.throws(() => totp.generateTotp(secret, { timestampMs: 1.5 }), /timestampMs/);
  assert.throws(() => totp.generateTotp(secret, { timestampMs: Number.MAX_SAFE_INTEGER + 1 }), /timestampMs/);
});

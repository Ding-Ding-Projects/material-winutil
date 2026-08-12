import assert from "node:assert/strict";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import test from "node:test";

import {
  CREDENTIAL_VAULT_PREFIX,
  deleteCredential,
  listCredentials,
  readCredential,
  writeCredential
} from "../../dist/main/credential-vault.js";

test("credential vault exposes a stable application-owned prefix", () => {
  assert.equal(CREDENTIAL_VAULT_PREFIX, "org.dingdingprojects.materialwinutil/v1/");
});

test("credential vault rejects unbounded or ambiguous identities before native access", async () => {
  await assert.rejects(writeCredential(null, "account", randomBytes(16)), /target/);
  await assert.rejects(writeCredential(undefined, "account", randomBytes(16)), /target/);
  await assert.rejects(writeCredential("valid-target", null, randomBytes(16)), /account/);
  await assert.rejects(writeCredential("../outside", "account", randomBytes(16)), /target/);
  await assert.rejects(writeCredential("valid-target", "account with spaces", randomBytes(16)), /account/);
  await assert.rejects(writeCredential("valid-target", "account", Buffer.alloc(0)), /secret/);
  await assert.rejects(writeCredential("valid-target", "account", Buffer.alloc(2_561)), /secret/);
});

test(
  "credential vault stores, reads, lists, replaces, and deletes an application-owned credential",
  { skip: process.platform === "win32" ? false : "Windows Credential Manager is unavailable on this platform." },
  async () => {
    const suffix = randomUUID();
    const target = `test-${suffix}`;
    const account = `account-${suffix}@example.invalid`;
    const firstSecret = randomBytes(48);
    const replacementSecret = randomBytes(64);

    try {
      await writeCredential(target, account, firstSecret);
      const firstRead = await readCredential(target, account);
      assert.ok(firstRead);
      assert.equal(firstRead.length, firstSecret.length);
      assert.equal(timingSafeEqual(firstRead, firstSecret), true);
      firstRead.fill(0);

      const listed = await listCredentials();
      assert.ok(listed.some((entry) => entry.target === target && entry.account === account));

      await writeCredential(target, account, replacementSecret);
      const replacementRead = await readCredential(target, account);
      assert.ok(replacementRead);
      assert.equal(replacementRead.length, replacementSecret.length);
      assert.equal(timingSafeEqual(replacementRead, replacementSecret), true);
      replacementRead.fill(0);

      assert.equal(await deleteCredential(target, account), true);
      assert.equal(await readCredential(target, account), null);
      assert.equal(await deleteCredential(target, account), false);
    } finally {
      await deleteCredential(target, account).catch(() => false);
      firstSecret.fill(0);
      replacementSecret.fill(0);
    }
  }
);

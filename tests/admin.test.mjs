import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdminUsername, normalizeTelegramUsername } from '../lib/admin.ts';

test('configured Telegram username grants editor access regardless of case or @',()=>{
 assert.equal(normalizeTelegramUsername('@SrGlD'),'srgld');
 assert.equal(isAdminUsername('srgld','@SrGlD'),true);
 assert.equal(isAdminUsername('other','@SrGlD'),false);
});
test('missing or invalid usernames cannot grant editor access',()=>{
 assert.equal(isAdminUsername(null,'srgld'),false);
 assert.equal(isAdminUsername('srgld',''),false);
 assert.equal(isAdminUsername('srgld','srgld,another'),false);
 assert.equal(isAdminUsername('srgld','@invalid/name'),false);
});

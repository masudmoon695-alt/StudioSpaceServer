import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeRegex, isValidEmail, isValidPassword, parseDate } from '../src/validation.js';

test('email and password rules match the registration requirements', () => {
  assert.equal(isValidEmail('creator@example.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidPassword('Studio1'), true);
  assert.equal(isValidPassword('studio1'), false);
  assert.equal(isValidPassword('STUDIO1'), false);
  assert.equal(isValidPassword('St1'), false);
});

test('search input is escaped before being used as a regular expression', () => {
  assert.equal(escapeRegex('photo (studio)+'), 'photo \\(studio\\)\\+');
});

test('date parsing rejects missing and invalid timestamps', () => {
  assert.equal(parseDate('not a date'), null);
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('2026-12-01T10:00:00.000Z') instanceof Date, true);
});

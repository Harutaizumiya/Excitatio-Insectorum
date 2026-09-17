import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInvitationUrl } from './teachers.controller';

test('invitation URL keeps the public web origin and encoded token', () => {
  assert.equal(
    buildInvitationUrl('token-_123', 'https://seat.haruta.top'),
    'https://seat.haruta.top/invite/token-_123',
  );
});

test('invitation URL preserves tokens that require path encoding', () => {
  assert.equal(
    buildInvitationUrl('token/with space', 'http://localhost:3001/'),
    'http://localhost:3001/invite/token%2Fwith%20space',
  );
});

import { expect } from '@oclif/test';
import { readFileSync } from 'fs';
import * as nock from 'nock';
import { customTest, inputFixture, outputFixture, testEnvironmentFile } from '../../test-helpers';

describe('connections:create', () => {
  customTest
    .stdout()
    .stderr()
    .mockCryppo()
    .nock('https://sandbox.meeco.me/vault', stubVault)
    .nock('https://sandbox.meeco.me/keystore', stubKeystore)
    .run([
      'connections:create',
      ...testEnvironmentFile,
      '-c',
      inputFixture('create-connection.input.yaml')
    ])
    .it('creates a connection between two users', ctx => {
      const expected = readFileSync(outputFixture('create-connection.output.yaml'), 'utf-8');
      expect(ctx.stdout).to.contain(expected.trim());
    });
});

function stubVault(api: nock.Scope) {
  api
    .post('/invitations', {
      public_key: {
        keypair_external_id: 'from_stored_keypair_id',
        public_key: '--PUBLIC_KEY--ABCD'
      },
      invitation: {
        encrypted_recipient_name: '[serialized][encrypted]TestTo[with from_data_encryption_key]'
      }
    })
    .reply(200, {
      invitation: {
        id: 'invitation_id',
        token: 'invitation_token'
      }
    });

  api
    .get('/connections')
    .matchHeader('Authorization', 'from_vault_access_token')
    .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
    .once()
    .reply(404);

  api
    .get('/connections')
    .matchHeader('Authorization', 'from_vault_access_token')
    .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
    .once()
    .reply(200, {
      connections: [
        {
          id: 'connection_id',
          other_user_connection_public_key: 'to_user_public',
          public_key: 'from_user_public'
        }
      ]
    });

  api
    .get('/connections')
    .matchHeader('Authorization', 'to_vault_access_token')
    .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
    .reply(200, {
      connections: [
        {
          id: 'connection_id',
          other_user_connection_public_key: 'from_user_public',
          public_key: 'to_user_public'
        }
      ]
    });

  api
    .post('/connections', {
      public_key: { keypair_external_id: 'to_stored_keypair_id', public_key: '--PUBLIC_KEY--ABCD' },
      connection: {
        encrypted_recipient_name:
          '[serialized][encrypted]TestFrom[with to_data_encryption_key\u0000\u0000]',
        invitation_token: 'invitation_token'
      }
    })
    .reply(200, {
      connection: {
        id: 'connection_id'
      }
    });
}

function stubKeystore(api: nock.Scope) {
  api
    .post('/keypairs', {
      public_key: '--PUBLIC_KEY--ABCD',
      encrypted_serialized_key:
        '[serialized][encrypted]--PRIVATE_KEY--12324[with to_key_encryption_key]',
      metadata: {},
      external_identifiers: []
    })
    .matchHeader('Authorization', 'to_keystore_access_token')
    .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
    .reply(200, {
      keypair: {
        id: 'to_stored_keypair_id'
      }
    });

  api
    .post('/keypairs', {
      public_key: '--PUBLIC_KEY--ABCD',
      encrypted_serialized_key:
        '[serialized][encrypted]--PRIVATE_KEY--12324[with from_key_encryption_key]',
      metadata: {},
      external_identifiers: []
    })
    .matchHeader('Authorization', 'from_keystore_access_token')
    .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
    .reply(200, {
      keypair: {
        id: 'from_stored_keypair_id'
      }
    });
}

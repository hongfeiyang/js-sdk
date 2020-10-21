import { ExternalAdmissionTokens, Session, SrpChallenge } from '@meeco/keystore-api-sdk';
import { expect } from '@oclif/test';
import open from 'cli-ux/lib/open';
import nock from 'nock';
import * as request from 'node-fetch';
import { UserService } from '../../src/services/user-service';
import Secrets from '../../src/util/secrets';
import { customTest, environment, getOutputFixture } from '../test-helpers';

describe('User creation', () => {
  (<any>open) = () => {
    return request('http://localhost:5210/', {
      method: 'post',
      body: JSON.stringify({
        'g-recaptcha-response': 'mock_captcha',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  };
  customTest
    .nock('https://sandbox.meeco.me/keystore', stubKeystore(false))
    .nock('https://sandbox.meeco.me/vault', stubVault)
    .mockCryppo()
    .mockSRP()
    .it('generates user with from parameters (password, secret)', async () => {
      const user = await new UserService(environment).create(
        '123.asupersecretpassphrase',
        '1.mocked_generated_username.my_secret_key'
      );

      const expected = getOutputFixture('create-user.output.json');
      expect(JSON.stringify(user)).to.contain(JSON.stringify(expected));
    });

  customTest
    .nock('https://sandbox.meeco.me/keystore', stubKeystore(true))
    .nock('https://sandbox.meeco.me/vault', stubVault)
    .mockCryppo()
    .mockSRP()
    .it('generates a new user from parameters (generated username)', async () => {
      const userService = new UserService(environment);
      const username = await userService.generateUsername();
      const secret = await Secrets.generateSecret(username);
      const user = await userService.create('123.asupersecretpassphrase', secret);

      const expected = getOutputFixture('create-user-generated-username.output.json');
      expect(JSON.stringify(user)).to.contain(JSON.stringify(expected));
    });
});

function stubKeystore(stubUsername: boolean) {
  return (api: nock.Scope) => {
    if (stubUsername) {
      api.post('/srp/username', {}).reply(200, {
        username: 'mocked_generated_username',
      });
    }

    api
      .post('/srp/users', {
        username: 'mocked_generated_username',
        srp_salt: '00SALT',
        srp_verifier: '000000000VERIFIER',
      })
      .reply(200, {});

    api
      .post('/srp/challenges', {
        srp_a: '000000000CLIENTPUBLIC',
        username: 'mocked_generated_username',
      })
      .reply(200, {
        challenge: <SrpChallenge>{
          challenge_b: '00SERVERPUBLIC',
          challenge_salt: '00SALT',
        },
      });

    api
      .post('/srp/session', {
        srp_m: '00SALT:00SERVERPUBLIC:PROOF',
        srp_a: '000000000CLIENTPUBLIC',
        username: 'mocked_generated_username',
      })
      .reply(200, {
        session: <Session>{
          session_authentication_string: 'keystore_auth_token',
        },
      });

    api
      .get('/external_admission_tokens')
      .matchHeader('Authorization', 'keystore_auth_token')
      .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
      .reply(200, {
        external_admission_token: <ExternalAdmissionTokens>{
          passphrase_store_admission_token: 'passphrase_token',
          vault_api_admission_token: 'vault_token',
        },
      });

    api
      .post('/key_encryption_key', {
        serialized_key_encryption_key: `[serialized][encrypted]randomly_generated_key[with derived_key_123.asupersecretpassphrase]`,
      })
      .matchHeader('Authorization', 'keystore_auth_token')
      .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
      .reply(200, {
        key_encryption_key: {
          id: 'key_encryption_key_id',
        },
      });

    api
      .post('/data_encryption_keys', {
        serialized_data_encryption_key: `[serialized][encrypted]randomly_generated_key[with randomly_generated_key]`,
      })
      .matchHeader('Authorization', 'keystore_auth_token')
      .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
      .reply(200, {
        data_encryption_key: {
          id: 'data_encryption_key_id',
        },
      });

    api
      .post('/keypairs', {
        public_key: '--PUBLIC_KEY--ABCD',
        encrypted_serialized_key:
          '[serialized][encrypted]--PRIVATE_KEY--12324[with randomly_generated_key]',
        external_identifiers: [UserService.VAULT_PAIR_EXTERNAL_IDENTIFIER],
      })
      .matchHeader('Authorization', 'keystore_auth_token')
      .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
      .reply(200, {});
  };
}

function stubVault(api: nock.Scope) {
  api
    .post('/me', {
      public_key: '--PUBLIC_KEY--ABCD',
      admission_token: 'vault_token',
    })
    .reply(200, {
      user: {
        id: 'vault_user',
      },
      encrypted_session_authentication_string: 'encrypted_vault_session_string',
      associations: [],
    });

  api
    .put('/me', {
      user: {
        private_dek_external_id: 'data_encryption_key_id',
      },
    })
    .matchHeader('Authorization', '[decrypted]encrypted_vault_session_string--PRIVATE_KEY--12324')
    .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
    .reply(200, {
      user: {},
      associations: [],
    });
}

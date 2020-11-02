import { ConnectionService, ShareService, ShareType } from '@meeco/sdk';
import { SharesIncomingResponse, SharesOutgoingResponse } from '@meeco/vault-api-sdk';
import { expect } from '@oclif/test';
import sinon from 'sinon';
import { customTest, environment, replaceUndefinedWithNull, testUserAuth } from '../test-helpers';

describe('ShareService', () => {
  describe('#shareItem', () => {
    let service: ShareService;

    beforeEach(() => {
      service = new ShareService(environment);
    });

    customTest
      .nock('https://sandbox.meeco.me/vault', api => api.get('/connections/bad').reply(404))
      .do(() => service.shareItem(testUserAuth, 'bad', 'itemId'))
      // .catch(e => expect(e).to.be.ok)
      .it('reports a missing connection');

    customTest
      .stub(ConnectionService, 'get', sinon.stub().returns({}))
      .do(() => service.shareItem(testUserAuth, 'connectionId', 'itemId'))
      // .catch(e => expect(e).to.be.ok)
      .it('reports a missing item');

    it('shares an item');
    it('shares a single slot');
  });

  describe('#acceptIncomingShare', () => {});

  describe('#getSharedItem', () => {});

  describe('#listShares', () => {
    // Incoming shares
    customTest
      .stdout()
      .stderr()
      .nock('https://sandbox.meeco.me/vault', mockVaultIncoming)
      .it('calls incoming_shares by default', async ctx => {
        const result = await new ShareService(environment).listShares(testUserAuth);

        expect(replaceUndefinedWithNull(result)).to.deep.members(response.shares);
      });

    // outgoing shares
    customTest
      .stdout()
      .stderr()
      .nock('https://sandbox.meeco.me/vault', mockVaultOutgoing)
      .it('calls outgoing_shares when passed a param', async ctx => {
        const result = await new ShareService(environment).listShares(
          testUserAuth,
          ShareType.outgoing
        );

        expect(replaceUndefinedWithNull(result)).to.deep.members(response.shares);
      });
  });

  const response: SharesIncomingResponse & SharesOutgoingResponse = {
    shares: [
      {
        id: '65b3c3c1-fe2b-48b6-8002-46be46c6d7f7',
        owner_id: '1c84f97a-877f-4f50-a85e-838c27750c95',
        sender_id: '1c84f97a-877f-4f50-a85e-838c27750c95',
        recipient_id: 'da5b0a98-4ef7-4cb7-889b-f17c77e94adc',
        acceptance_required: 'acceptance_required',
        item_id: '2c9b15f1-7b28-44af-9fe0-70e3ea308c0c',
        slot_id: null,
        public_key: '-----BEGIN PUBLIC KEY-----ABCD',
        sharing_mode: 'anyone',
        keypair_external_id: 'edff1a41-5cc9-45ef-8800-20948c86fd5c',
        encrypted_dek: null,
        terms: null,
        created_at: new Date(1),
        expires_at: null,
      },
      {
        id: '9ff995b7-660a-433a-9c84-809eda70db7f',
        owner_id: '1c84f97a-877f-4f50-a85e-838c27750c95',
        sender_id: '1c84f97a-877f-4f50-a85e-838c27750c95',
        recipient_id: 'da5b0a98-4ef7-4cb7-889b-f17c77e94adc',
        acceptance_required: 'acceptance_not_required',
        item_id: '325f5e77-c670-4ecf-a4d9-84bcc6c9e46e',
        slot_id: null,
        public_key: '-----BEGIN PUBLIC KEY-----ABCD',
        sharing_mode: 'owner',
        keypair_external_id: 'edff1a41-5cc9-45ef-8800-20948c86fd5c',
        encrypted_dek:
          'Rsa4096.omdqu-um6RWbqcCOBwk6-9FVY1tAlkjCD1tU7i1l94vLksE2K4PsuFqbM5QLJdHj7mShKywCCC18LW7ShTj7wXI9L9dRcqVhSZCd4fAS_BK-r0Mi9MeS6284zPjW26KIetu28pIdfUZOLhmiWmSq_xUvbx7wqAahFrHuHfjfl7UKd1lnaWabMQe7GbL0giJWhFliHtTOF2h74nqWnHwYT-sqJLyECacUb3N5p6ySKzv0Vjqf7CWu-lW6rsL0c2_VoRQTBZSBNyWx98Ig3dQHGVYgs1c__94M4w5TLY0QrCZWUcrqlwik7QpJQhCPioQGM32xRMxBi584TfqPQ_KmImAr7H9Rh-EW39fhH_7cqnYpvvZYNl1FYrF4GIvb_EVmqjIILpFLuhtmXuu8NLXUAy2-BpgJteqOLM0sqnMoeayuQQxO1OZJ38GYcHTTUPCoEnRfkTsQMJOuZq7PjC_PpWP1MsG3WfY4haBHvhqN0CcPS-TpcDPqcDwAxaEADHOTvl6WdorTLjO6mV2WLQfrQfMbFQ4Kkrt_YB-gm-_PCw-04o27amg59Tzu3HnPijb27GnfV3yMv_jGiY-_wK98evxNHDbvApk97LQXvLVmyO-_DLlkSnBvByLlf2CZwFOWvxqUTRchlRtjLDX7Cw7GQqBnuzEplP5LZ9QhnLAUQfU=.QQUAAAAA',
        terms: null,
        created_at: new Date(1),
        expires_at: null,
      },
    ],
    next_page_after: null,
    meta: [],
  };

  function mockVaultIncoming(api) {
    api
      .get('/incoming_shares')
      .matchHeader('Authorization', testUserAuth.vault_access_token)
      .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
      .reply(200, response);
  }

  function mockVaultOutgoing(api) {
    api
      .get('/outgoing_shares')
      .matchHeader('Authorization', '2FPN4n5T68xy78i6HHuQ')
      .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
      .reply(200, response);
  }
});

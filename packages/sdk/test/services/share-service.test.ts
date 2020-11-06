import { AcceptanceStatus, ConnectionService, ShareService, ShareType } from '@meeco/sdk';
import { Share, SharesIncomingResponse, SharesOutgoingResponse } from '@meeco/vault-api-sdk';
import { expect } from 'chai';
import sinon from 'sinon';
import { default as itemResponse } from '../fixtures/responses/item-response/basic';
import { customTest, environment, testUserAuth } from '../test-helpers';

describe('ShareService', () => {
  describe('#shareItem', () => {
    let service: ShareService;
    const itemId = itemResponse.item.id;
    const connectionId = '123';

    beforeEach(() => {
      service = new ShareService(environment);
    });

    const connectionStub = customTest.mockCryppo().stub(
      ConnectionService.prototype,
      'get',
      sinon
        .stub()
        .withArgs(connectionId)
        .returns({ the_other_user: { user_public_key: 'abc', user_keypair_external_id: '123' } })
    );

    connectionStub
      .nock('https://sandbox.meeco.me/vault', api => {
        api.get(`/items/${itemId}`).reply(200, itemResponse);
        api.post(`/items/${itemId}/shares`).reply(201, { shares: [] });
      })
      .do(() => service.shareItem(testUserAuth, connectionId, itemId))
      .it('shares an item');

    connectionStub
      .nock('https://sandbox.meeco.me/vault', api => {
        api.get(`/items/${itemId}`).reply(200, itemResponse);
        api
          .post(`/items/${itemId}/shares`, body =>
            body.shares[0].encrypted_dek.endsWith('[with abc]')
          )
          .reply(201, { shares: [] });
      })
      .do(() => service.shareItem(testUserAuth, connectionId, itemId))
      .it('encrypts the DEK with the share public key');

    const nullSlotId = '123';
    const itemWithNull = {
      ...itemResponse,
      item: {
        ...itemResponse.item,
      },
    };
    itemWithNull.item.slot_ids = itemWithNull.item.slot_ids.concat(nullSlotId);
    itemWithNull.slots = itemWithNull.slots.concat({
      ...itemResponse.slots[0],
      id: nullSlotId,
      encrypted_value: null,
    });

    connectionStub
      .nock('https://sandbox.meeco.me/vault', api => {
        api.get(`/items/${itemId}`).reply(200, itemWithNull);
        // Test: if nullSlotId is in the POST body, it's value must be undefined
        api
          .post(`/items/${itemId}/shares`, body =>
            body.shares[0].slot_values.every(
              ({ slot_id, encrypted_value }) =>
                slot_id !== nullSlotId || encrypted_value === undefined
            )
          )
          .reply(201, { shares: [] });
      })
      .do(() => service.shareItem(testUserAuth, connectionId, itemId))
      .it('does not post slots with null values');

    connectionStub
      .nock('https://sandbox.meeco.me/vault', api => {
        api.get(`/items/${itemId}`).reply(200, itemResponse);
        api
          .post(
            `/items/${itemId}/shares`,
            body =>
              body.shares[0].slot_id === 'pizza' &&
              body.shares[0].slot_values[0].slot_id === 'pizza' &&
              body.shares[0].slot_values.length === 1
          )
          .reply(201, { shares: [] });
      })
      .do(() => service.shareItem(testUserAuth, connectionId, itemId, { slot_id: 'pizza' }))
      .it('shares a single slot');
  });

  describe('#acceptIncomingShare', () => {
    const shareId = '123';

    customTest
      .nock('https://sandbox.meeco.me/vault', api => {
        api.put(`/incoming_shares/${shareId}/accept`).reply(201, { share: {} });
      })
      .do(() => new ShareService(environment).acceptIncomingShare(testUserAuth, shareId))
      .it('calls PUT /incoming_shares/id/accept');

    customTest
      .nock('https://sandbox.meeco.me/vault', api => {
        api.put(`/incoming_shares/${shareId}/accept`).reply(404);
      })
      .do(() => new ShareService(environment).acceptIncomingShare(testUserAuth, shareId))
      .catch(`Share with id '${shareId}' not found for the specified user`)
      .it('throws an error when share does not exist');
  });

  describe('#deleteSharedItem', () => {
    const shareId = '123';

    customTest
      .nock('https://sandbox.meeco.me/vault', api => {
        api.delete(`/shares/${shareId}`).reply(200);
      })
      .do(() => new ShareService(environment).deleteSharedItem(testUserAuth, shareId))
      .it('calls DELETE /shares/id');

    customTest
      .nock('https://sandbox.meeco.me/vault', api => {
        api.delete(`/shares/${shareId}`).reply(404);
      })
      .do(() => new ShareService(environment).deleteSharedItem(testUserAuth, shareId))
      .catch(`Share with id '${shareId}' not found for the specified user`)
      .it('throws an error when share does not exist');
  });

  describe('#getShareDEK', () => {
    const keypairId = '123';
    const dek = 'pineapple';
    const publicKey = 'public_key';

    customTest
      .mockCryppo()
      .nock('https://sandbox.meeco.me/keystore', api => {
        api
          .get(`/keypairs/${keypairId}`)
          .reply(200, { keypair: { encrypted_serialized_key: publicKey } });
      })
      .add('result', () =>
        new ShareService(environment).getShareDEK(testUserAuth, {
          encrypted_dek: dek,
          keypair_external_id: keypairId,
        } as Share)
      )
      .it('decrypts a shared DEK using the correct keypair', ({ result }) => {
        expect(result.key).to.equal(
          `[decrypted]${dek}${publicKey}[decrypted with ${testUserAuth.key_encryption_key.key}]`
        );
      });

    customTest
      .mockCryppo()
      .add('result', () =>
        new ShareService(environment).getShareDEK(testUserAuth, {
          encrypted_dek: null,
          keypair_external_id: keypairId,
        } as Share)
      )
      .it('returns the users private key when item is re-encrypted', ({ result }) => {
        expect(result.key).to.equal(testUserAuth.data_encryption_key.key);
      });
  });

  describe('#getSharedItem', () => {
    const shareId = '123';
    const otherShareId = '456';

    customTest
      .mockCryppo()
      .nock('https://sandbox.meeco.me/vault', api => {
        api.get(`/incoming_shares/${shareId}/item`).reply(200, {
          ...itemResponse,
          share: {
            item_id: itemResponse.item.id,
            acceptance_required: 'accepted',
          },
        });
      })
      .stub(ShareService.prototype, 'getShareDEK', sinon.stub().returns({ key: 'some_key' }))
      .do(() => new ShareService(environment).getSharedItem(testUserAuth, shareId))
      .it('calls GET /incoming_shares/id/item by default');

    customTest
      .mockCryppo()
      .nock('https://sandbox.meeco.me/vault', api => {
        api
          .get(`/outgoing_shares/${shareId}`)
          .reply(200, { share: { item_id: itemResponse.item.id } });
        api.get(`/items/${itemResponse.item.id}`).reply(200, itemResponse);
      })
      .do(() =>
        new ShareService(environment).getSharedItem(testUserAuth, shareId, ShareType.outgoing)
      )
      .it('gets an outgoing shared item');

    customTest
      .mockCryppo()
      .nock('https://sandbox.meeco.me/vault', api => {
        api.get(`/incoming_shares/${shareId}/item`).reply(200, {
          ...itemResponse,
          share: {
            item_id: itemResponse.item.id,
            acceptance_required: AcceptanceStatus.required,
          },
        });
      })
      .do(() => new ShareService(environment).getSharedItem(testUserAuth, shareId))
      .catch(e => expect(e).to.be.ok)
      .it('does not decrypt the Item if it is not accepted');

    customTest
      .mockCryppo()
      .nock('https://sandbox.meeco.me/vault', api => {
        api.get(`/incoming_shares/${shareId}/item`).reply(200, {
          ...itemResponse,
          share: {
            item_id: itemResponse.item.id,
            acceptance_required: 'accepted',
          },
          item_shared_via_another_share_id: otherShareId,
        });

        api.get(`/incoming_shares/${otherShareId}/item`).reply(200, {
          ...itemResponse,
          share: {
            item_id: itemResponse.item.id,
            acceptance_required: 'accepted',
          },
        });
      })
      .stub(ShareService.prototype, 'getShareDEK', sinon.stub().returns({ key: 'some_key' }))
      .do(() => new ShareService(environment).getSharedItem(testUserAuth, shareId))
      .it('retrieves the original if an item was already shared');

    customTest
      .nock('https://sandbox.meeco.me/vault', api => {
        api.get(`/incoming_shares/${shareId}/item`).reply(404);
      })
      .do(() => new ShareService(environment).getSharedItem(testUserAuth, shareId))
      .catch(`Share with id '${shareId}' not found for the specified user`)
      .it('throws an error when share does not exist');
  });

  describe('#updateSharedItem', () => {
    it('does not update a received Item');
    it('sends the update');
  });

  describe('#listShares', () => {
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

    // Incoming shares
    customTest
      .nock('https://sandbox.meeco.me/vault', api =>
        api.get('/incoming_shares').reply(200, response)
      )
      .do(() => new ShareService(environment).listShares(testUserAuth))
      .it('calls GET /incoming_shares by default');

    // outgoing shares
    customTest
      .nock('https://sandbox.meeco.me/vault', api =>
        api.get('/outgoing_shares').reply(200, response)
      )
      .do(() => new ShareService(environment).listShares(testUserAuth, ShareType.outgoing))
      .it('calls GET /outgoing_shares when passed a param');
  });
});

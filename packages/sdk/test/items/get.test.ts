import { expect } from '@oclif/test';
import { ItemService } from '../../src/services/item-service';
import {
  customTest,
  environment,
  getOutputFixture,
  replaceUndefinedWithNull,
  testUserAuth,
} from '../test-helpers';

describe('Items get', () => {
  customTest
    .mockCryppo()
    .nock('https://sandbox.meeco.me/vault', mockVault)
    .it('returns an item with all slots decrypted', async () => {
      const result = await new ItemService(environment).get(testUserAuth, 'my-item');

      const { slots: expectedSlots, thumbnails, attachments, ...expectedItem } = getOutputFixture(
        'get-item.output.json'
      );
      expect(replaceUndefinedWithNull(result.item)).to.eql(expectedItem);
      expect(replaceUndefinedWithNull(result.slots)).to.deep.members(expectedSlots);
    });
});

const response = {
  item: {
    created_at: new Date(1),
    updated_at: new Date(1),
    label: 'My Fave Foods',
    name: 'food',
    slot_ids: ['steak', 'pizza', 'yoghurt'],
  },
  slots: [
    {
      id: 'pizza',
      label: 'Pizza',
      name: 'pizza',
      foo: 'bar',
      slot_type_name: 'key_value',
      encrypted_value: 'Hawaiian',
      encrypted: true,
      created_at: new Date(1),
      updated_at: new Date(1),
    },
    {
      id: 'steak',
      label: 'Steak',
      name: 'steak',
      foo: 'bar',
      slot_type_name: 'key_value',
      encrypted_value: 'Rump',
      encrypted: true,
      created_at: new Date(1),
      updated_at: new Date(1),
    },
    {
      id: 'beer',
      label: 'Beer',
      name: 'beer',
      foo: 'bar',
      slot_type_name: 'key_value',
      encrypted_value: 'Session Ale',
      encrypted: true,
      created_at: new Date(1),
      updated_at: new Date(1),
    },
  ],
  associations_to: [],
  associations: [],
  attachments: [],
  classification_nodes: [],
  thumbnails: [],
};

function mockVault(api) {
  api
    .get('/items/my-item')
    .matchHeader('Authorization', '2FPN4n5T68xy78i6HHuQ')
    .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
    .reply(200, response);
}

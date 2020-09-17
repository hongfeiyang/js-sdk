import * as sdk from '@meeco/sdk';
import { expect } from '@oclif/test';
import { readFileSync } from 'fs';
import { customTest, outputFixture, testEnvironmentFile, testUserAuth } from '../../test-helpers';

describe('templates:info', () => {
  customTest
    .stub(sdk, 'vaultAPIFactory', vaultAPIFactory as any)
    .stderr()
    .stdout()
    .run(['templates:info', 'drink', ...testUserAuth, ...testEnvironmentFile])
    .it('fetches info about a particular template', ctx => {
      const expected = readFileSync(outputFixture('info-template.output.yaml'), 'utf-8');
      expect(ctx.stdout).to.contain(expected);
    });
});

const result = {
  next_page_after: null,
  attachments: [],
  thumbnails: [],
  classification_nodes: [],
  slots: [
    {
      id: 'pizza',
      own: null,
      share_id: null,
      name: null,
      description: null,
      encrypted: null,
      ordinal: null,
      visible: null,
      classification_node_ids: null,
      attachment_id: null,
      slotable_id: null,
      slotable_type: null,
      required: null,
      updated_at: new Date(0),
      created_at: new Date(0),
      slot_type_name: null,
      creator: null,
      encrypted_value: null,
      encrypted_value_verification_key: null,
      value_verification_hash: null,
      image: null,
      label: null,
      original_id: null,
      owner_id: null,
    },
    {
      id: 'steak',
      own: null,
      share_id: null,
      name: null,
      description: null,
      encrypted: null,
      ordinal: null,
      visible: null,
      classification_node_ids: null,
      attachment_id: null,
      slotable_id: null,
      slotable_type: null,
      required: null,
      updated_at: new Date(0),
      created_at: new Date(0),
      slot_type_name: null,
      creator: null,
      encrypted_value: null,
      encrypted_value_verification_key: null,
      value_verification_hash: null,
      image: null,
      label: null,
      original_id: null,
      owner_id: null,
    },
    {
      id: 'yoghurt',
      own: null,
      share_id: null,
      name: null,
      description: null,
      encrypted: null,
      ordinal: null,
      visible: null,
      classification_node_ids: null,
      attachment_id: null,
      slotable_id: null,
      slotable_type: null,
      required: null,
      updated_at: new Date(0),
      created_at: new Date(0),
      slot_type_name: null,
      creator: null,
      encrypted_value: null,
      encrypted_value_verification_key: null,
      value_verification_hash: null,
      image: null,
      label: null,
      original_id: null,
      owner_id: null,
    },
    {
      id: 'water',
      own: null,
      share_id: null,
      name: null,
      description: null,
      encrypted: null,
      ordinal: null,
      visible: null,
      classification_node_ids: null,
      attachment_id: null,
      slotable_id: null,
      slotable_type: null,
      required: null,
      updated_at: new Date(0),
      created_at: new Date(0),
      slot_type_name: null,
      creator: null,
      encrypted_value: null,
      encrypted_value_verification_key: null,
      value_verification_hash: null,
      image: null,
      label: null,
      original_id: null,
      owner_id: null,
    },
    {
      id: 'beer',
      own: null,
      share_id: null,
      name: null,
      description: null,
      encrypted: null,
      ordinal: null,
      visible: null,
      classification_node_ids: null,
      attachment_id: null,
      slotable_id: null,
      slotable_type: null,
      required: null,
      updated_at: new Date(0),
      created_at: new Date(0),
      slot_type_name: null,
      creator: null,
      encrypted_value: null,
      encrypted_value_verification_key: null,
      value_verification_hash: null,
      image: null,
      label: null,
      original_id: null,
      owner_id: null,
    },
  ],
  item_templates: [
    {
      id: null,
      name: 'food',
      description: null,
      ordinal: null,
      visible: null,
      user_id: null,
      updated_at: new Date(0),
      image: null,
      template_type: null,
      classification_node_ids: null,
      slot_ids: null,
      label: null,
      background_color: null,
    },
    {
      id: null,
      name: 'drink',
      description: null,
      ordinal: null,
      visible: null,
      user_id: null,
      updated_at: new Date(0),
      image: null,
      template_type: null,
      classification_node_ids: null,
      slot_ids: ['yoghurt', 'water', 'beer'],
      label: null,
      background_color: null,
    },
  ],
  meta: null,
};

function vaultAPIFactory(environment) {
  return authConfig => ({
    ItemTemplateApi: {
      itemTemplatesGet: (classificationScheme, classificationName) => Promise.resolve(result),
    },
  });
}

import { expect } from '@oclif/test';
import { readFileSync } from 'fs';
import {
  customTest,
  inputFixture,
  outputFixture,
  testEnvironmentFile,
  testUserAuth
} from '../../test-helpers';

describe('organization-services:create', () => {
  customTest
    .stdout()
    .stderr()
    .mockCryppo()
    .nock('https://sandbox.meeco.me/vault', api => {
      api
        .post('/organizations/organization_id/services')
        .matchHeader('Authorization', '2FPN4n5T68xy78i6HHuQ')
        .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
        .reply(201, response);
    })
    .run([
      'organization-services:create',
      'organization_id',
      ...testUserAuth,
      ...testEnvironmentFile,
      '-c',
      inputFixture('create-organization-service.input.yaml')
    ])
    .it('Requests the creation of a new organization service', ctx => {
      const expected = readFileSync(
        outputFixture('create-organization-services.output.yaml'),
        'utf-8'
      );
      expect(ctx.stdout.trim()).to.equal(expected.trim());
    });
});

const response = {
  service: {
    id: 'f71272a3-d26b-4b85-9b0b-b3fd24c4ea0a',
    name: 'Twitter Service',
    description: 'Fetch all twitter data',
    contract: { name: 'sample contract' },
    organization_id: 'e2fed464-878b-4d4b-9017-99abc50504ed',
    validated_by_id: null,
    validated_at: null,
    agent_id: null,
    created_at: '2020-07-02T05:47:44.983Z',
    status: 'requested'
  },
  organization: {
    id: 'e2fed464-878b-4d4b-9017-99abc50504ed',
    name: 'Alphabet Inc.',
    description: 'My super data handling organization',
    url: 'https://superdata.example.com',
    email: 'admin@superdata.example.com',
    requestor_id: '468d3666-dfd7-4a17-9091-3bdcf51f45bb',
    validated_by_id: '49a38f1c-4a92-464e-bed2-cd6ffa428da1',
    validated_at: '2020-07-02T01:58:07.313Z',
    agent_id: '706ff9fb-bd58-4707-ba6c-50f97b94718b',
    created_at: '2020-07-02T01:57:42.437Z',
    updated_at: '2020-07-02T01:58:07.934Z',
    status: 'validated'
  }
};

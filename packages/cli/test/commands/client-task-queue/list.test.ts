import { ClientTaskQueueService, ClientTaskState } from '@meeco/sdk';
import { expect } from '@oclif/test';
import { readFileSync } from 'fs';
import {
  customTest,
  outputFixture,
  testEnvironmentFile,
  testGetAll,
  testUserAuth,
} from '../../test-helpers';

describe('client-task-queue:list', () => {
  customTest
    .stub(ClientTaskQueueService.prototype, 'list', list as any)
    .stdout()
    .run([
      'client-task-queue:list',
      ...testUserAuth,
      ...testEnvironmentFile,
      '-s',
      ClientTaskState.Todo,
    ])
    .it('lists Client Tasks', ctx => {
      const expected = readFileSync(outputFixture('list-client-task-queue.output.yaml'), 'utf-8');
      expect(ctx.stdout.trim()).to.equal(expected.trim());
    });

  customTest
    .stub(ClientTaskQueueService.prototype, 'list', listEach as any)
    .stdout()
    .run(['client-task-queue:list', ...testUserAuth, ...testEnvironmentFile])
    .it('lists all types of Client Tasks by default', ctx => {
      const expected = readFileSync(
        outputFixture('list-client-task-queue-many.output.yaml'),
        'utf-8'
      );
      expect(ctx.stdout.trim()).to.equal(expected.trim());
    });

  customTest
    .stub(ClientTaskQueueService.prototype, 'listAll', listAll as any)
    .stdout()
    .run([
      'client-task-queue:list',
      ...testUserAuth,
      ...testEnvironmentFile,
      ...testGetAll,
      '-s',
      ClientTaskState.Todo,
    ])
    .it('list all tasks for client when paginated', ctx => {
      const expected = readFileSync(outputFixture('list-client-task-queue.output.yaml'), 'utf-8');
      expect(ctx.stdout.trim()).to.equal(expected.trim());
    });
});

const response = {
  client_tasks: [
    {
      id: 'a',
      state: 'todo',
      work_type: 'update_share',
      target_id: 'share_item_id_a',
      additional_options: {},
      last_state_transition_at: new Date(1),
      report: {},
      created_at: new Date(1),
    },
    {
      id: 'b',
      state: 'todo',
      work_type: 'update_share',
      target_id: 'share_item_id_b',
      additional_options: {},
      last_state_transition_at: new Date(1),
      report: {},
      created_at: new Date(1),
    },
  ],
  meta: [],
};

const responseEachType = {
  client_tasks: [
    {
      id: 'a',
      state: ClientTaskState.Todo,
      work_type: 'update_share',
      target_id: 'share_item_id_a',
      additional_options: {},
      last_state_transition_at: new Date(1),
      report: {},
      created_at: new Date(1),
    },
    {
      id: 'b',
      state: ClientTaskState.InProgress,
      work_type: 'update_share',
      target_id: 'share_item_id_b',
      additional_options: {},
      last_state_transition_at: new Date(1),
      report: {},
      created_at: new Date(1),
    },
    {
      id: 'c',
      state: ClientTaskState.Done,
      work_type: 'update_share',
      target_id: 'share_item_id_b',
      additional_options: {},
      last_state_transition_at: new Date(1),
      report: {},
      created_at: new Date(1),
    },
    {
      id: 'd',
      state: ClientTaskState.Failed,
      work_type: 'update_share',
      target_id: 'share_item_id_b',
      additional_options: {},
      last_state_transition_at: new Date(1),
      report: {},
      created_at: new Date(1),
    },
  ],
  meta: [],
};

function list() {
  return Promise.resolve(response);
}

function listEach() {
  return Promise.resolve(responseEachType);
}

function listAll() {
  return Promise.resolve(response.client_tasks);
}

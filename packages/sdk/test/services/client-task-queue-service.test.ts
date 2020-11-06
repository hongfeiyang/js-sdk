import { ItemService } from '@meeco/sdk';
import { ClientTask, Slot } from '@meeco/vault-api-sdk';
import { expect } from '@oclif/test';
import * as nock from 'nock';
import {
  ClientTaskQueueService,
  ClientTaskState,
} from '../../src/services/client-task-queue-service';
import { MOCK_NEXT_PAGE_AFTER } from '../constants';
import { default as itemResponse } from '../fixtures/responses/item-response/basic';
import { default as sharesResponse } from '../fixtures/responses/item-shares-response';
import { default as itemSharesUpdateResponse } from '../fixtures/responses/item-shares-update-response';
import { customTest, environment, getOutputFixture, testUserAuth } from '../test-helpers';

describe('ClientTaskQueueService', () => {
  const itemId = itemResponse.item.id;

  function mockTask(id: string, state: ClientTaskState): ClientTask {
    return {
      id,
      state,
      work_type: 'update_item_shares',
      target_id: itemId,
      additional_options: {},
      last_state_transition_at: new Date(1),
      report: {},
      created_at: new Date(1),
    };
  }

  describe('#execute', () => {
    customTest
      .stub(ItemService.prototype, 'get', getSharedItem as any)
      .nock('https://sandbox.meeco.me/vault', stubVault)
      .mockCryppo()
      .add('result', () =>
        new ClientTaskQueueService(environment).execute(testUserAuth, [
          mockTask('a', ClientTaskState.Todo),
        ])
      )
      .it('executes and updates ClientTasks', ({ result }) => {
        expect(result.failed.length).to.equal(0);
      });

    customTest
      .add('service', () => new ClientTaskQueueService(environment))
      .do(({ service }) =>
        service.execute(testUserAuth, [mockTask('a', ClientTaskState.InProgress)])
      )
      .catch(e => expect(e).to.be.ok)
      .it('does not execute in_progress tasks');

    customTest
      .add('service', () => new ClientTaskQueueService(environment))
      .do(({ service }) => service.execute(testUserAuth, [mockTask('a', ClientTaskState.Done)]))
      .catch(e => expect(e).to.be.ok)
      .it('does not execute done tasks');

    customTest
      .stub(ItemService.prototype, 'get', getSharedItem as any)
      .nock('https://sandbox.meeco.me/vault', stubVault)
      .mockCryppo()
      .add('result', () =>
        new ClientTaskQueueService(environment).execute(testUserAuth, [
          mockTask('a', ClientTaskState.Failed),
        ])
      )
      .it('executes failed tasks', ({ result }) => {
        expect(result.completed.length).to.equal(1);
        expect(result.failed.length).to.equal(0);
      });

    function stubVault(api: nock.Scope) {
      const doneTasksResult = [mockTask('a', ClientTaskState.Done)];
      const inProgressTasksResult = [mockTask('a', ClientTaskState.InProgress)];

      api
        .put(`/items/${itemId}/shares`)
        .matchHeader('Authorization', testUserAuth.vault_access_token)
        .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
        .reply(200, itemSharesUpdateResponse);

      api
        .put(`/client_task_queue`, (body: any) =>
          body.client_tasks.every(x => x.state === ClientTaskState.InProgress)
        )
        .matchHeader('Authorization', testUserAuth.vault_access_token)
        .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
        .reply(200, { client_tasks: inProgressTasksResult });

      api
        .get(`/items/${itemId}/shares`)
        .matchHeader('Authorization', testUserAuth.vault_access_token)
        .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
        .reply(200, sharesResponse);

      api
        .put(`/client_task_queue`, (body: any) =>
          body.client_tasks.every(x => x.state === ClientTaskState.Done)
        )
        .matchHeader('Authorization', testUserAuth.vault_access_token)
        .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
        .reply(200, { client_tasks: doneTasksResult });
    }

    function getSharedItem() {
      return Promise.resolve({
        ...itemResponse,
        slots: ((itemResponse.slots as any) as Slot[]).map(x => ({ ...x, value: '1234' })),
      });
    }
  });

  const listResponse = {
    client_tasks: ['a', 'b'].map(id => mockTask(id, ClientTaskState.Todo)),
    meta: [],
  };

  describe('#list', () => {
    customTest
      .nock('https://sandbox.meeco.me/vault', api =>
        api
          .get('/client_task_queue')
          .query({ supress_changing_state: true, state: 'todo' })
          .matchHeader('Authorization', testUserAuth.vault_access_token)
          .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
          .reply(200, listResponse)
      )
      .add('result', () =>
        new ClientTaskQueueService(environment).list(testUserAuth, true, ClientTaskState.Todo)
      )
      .add('expected', () => getOutputFixture('list-client-task-queue.output.json'))
      .it('list tasks that the client must perform', ({ result, expected }) => {
        expect(result.client_tasks).to.deep.members(expected);
      });
  });

  describe('#listAll', () => {
    const responsePart1 = {
      ...listResponse,
      client_tasks: [listResponse.client_tasks[0]],
      next_page_after: MOCK_NEXT_PAGE_AFTER,
      meta: [{ next_page_exists: true }],
    };

    const responsePart2 = {
      ...listResponse,
      client_tasks: [listResponse.client_tasks[1]],
    };

    customTest
      .nock('https://sandbox.meeco.me/vault', api =>
        api
          .get('/client_task_queue')
          .query({ supress_changing_state: true, state: 'todo' })
          .matchHeader('Authorization', testUserAuth.vault_access_token)
          .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
          .reply(200, responsePart1)
          .get('/client_task_queue')
          .query({
            supress_changing_state: true,
            state: 'todo',
            next_page_after: MOCK_NEXT_PAGE_AFTER,
          })
          .matchHeader('Authorization', testUserAuth.vault_access_token)
          .matchHeader('Meeco-Subscription-Key', 'environment_subscription_key')
          .reply(200, responsePart2)
      )
      .it('list all tasks for client when paginated', async () => {
        const result = await new ClientTaskQueueService(environment).listAll(
          testUserAuth,
          true,
          ClientTaskState.Todo
        );

        const expected = getOutputFixture('list-client-task-queue.output.json');
        expect(result).to.deep.members(expected);
      });
  });
});

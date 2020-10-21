import { ClientTask, ClientTaskQueueApi, ClientTaskQueueResponse } from '@meeco/vault-api-sdk';
import { MeecoServiceError } from '../models/service-error';
import { getAllPaged, reducePages, resultHasNext } from '../util/paged';
import Service, { IDEK, IKEK, IKeystoreToken, IPageOptions, IVaultToken } from './service';
import { ShareService } from './share-service';

interface IFailedClientTask extends ClientTask {
  failureReason: any;
}

export enum ClientTaskState {
  Todo = 'todo',
  InProgress = 'in_progress',
  Done = 'done',
  Failed = 'failed',
}

export interface IOutstandingClientTasks {
  todo: number;
  in_progress: number;
}

export interface IClientTaskExecResult {
  completed: ClientTask[];
  failed: IFailedClientTask[];
}

/**
 * A ClientTask describes a set of API actions the client has been requested to perform,
 * usually encrypting some data with their private keys.
 */
export class ClientTaskQueueService extends Service<ClientTaskQueueApi> {
  public getAPI(token: IVaultToken): ClientTaskQueueApi {
    return this.vaultAPIFactory(token.vault_access_token).ClientTaskQueueApi;
  }

  /**
   *
   * @param suppressChangingClientTaskState If false, all 'todo' tasks retrieved by this call will change state to 'in_progress'.
   * @param state Show only tasks with this state.
   * @param options By default results are paginated, with 200 results per page.
   */
  public async list(
    credentials: IVaultToken,
    suppressChangingClientTaskState: boolean = true,
    state: ClientTaskState = ClientTaskState.Todo,
    options?: IPageOptions
  ): Promise<ClientTaskQueueResponse> {
    const result = await this.vaultAPIFactory(
      credentials.vault_access_token
    ).ClientTaskQueueApi.clientTaskQueueGet(
      options?.nextPageAfter,
      options?.perPage,
      suppressChangingClientTaskState,
      state
    );

    if (resultHasNext(result) && options?.perPage === undefined) {
      this.logger.warn('Some results omitted, but page limit was not explicitly set');
    }

    return result;
  }

  /**
   *
   * @param suppressChangingClientTaskState If false, all 'todo' tasks retrieved by this call will change state to 'in_progress'.
   * @param state Show only tasks with this state.
   */
  public async listAll(
    credentials: IVaultToken,
    suppressChangingClientTaskState: boolean = true,
    state: ClientTaskState = ClientTaskState.Todo
  ): Promise<ClientTask[]> {
    const api = this.vaultAPIFactory(credentials.vault_access_token).ClientTaskQueueApi;
    return getAllPaged(cursor =>
      api.clientTaskQueueGet(cursor, undefined, suppressChangingClientTaskState, state)
    )
      .then(reducePages)
      .then(result => result.client_tasks);
  }

  /**
   * Count all tasks that have state either 'todo' or 'in_progress'.
   * May make multiple API calls, depending on number of tasks.
   */
  public async countOutstandingTasks(credentials: IVaultToken): Promise<IOutstandingClientTasks> {
    const allTasks = await this.listAll(credentials);

    const initialCount = { todo: 0, in_progress: 0 };
    const result = allTasks.reduce((acc, task) => {
      if (task.state === ClientTaskState.Todo) {
        acc.todo += 1;
      } else if (task.state === ClientTaskState.InProgress) {
        acc.in_progress += 1;
      }
      return acc;
    }, initialCount);

    return result;
  }

  /**
   * Execute the given ClientTasks, updating their state in the API.
   * Currently, the only implemented task is 'update_item_share'.
   *
   * ClientTask state is set to 'in_progress' once execution begins.
   * Any tasks with state 'in_progress' or 'done' will raise an exception.
   * Tasks with state 'failed' will be retried.
   *
   * No tasks are initiated if any one of the tasks is unrecognized or cannot be started.
   * @param tasks ClientTasks to be executed. Each must have state 'todo' or 'failed'.
   * @param authData
   */
  public async execute(
    credentials: IVaultToken & IKeystoreToken & IKEK & IDEK,
    tasks: ClientTask[]
  ): Promise<IClientTaskExecResult> {
    this.logger.log(`Executing ${tasks.length} tasks`);

    for (const task of tasks) {
      if (task.work_type !== 'update_item_shares') {
        throw new MeecoServiceError(
          `Do not know how to execute ClientTask of type ${task.work_type}`
        );
      }

      if (task.state === ClientTaskState.InProgress || task.state === ClientTaskState.Done) {
        throw new MeecoServiceError(
          `Cannot execute ${task.work_type} task ${task.id} because it is already ${task.state}`
        );
      }
    }

    const updateSharesTasksResult: IClientTaskExecResult = await this.updateSharesClientTasks(
      credentials,
      tasks
    );

    return updateSharesTasksResult;
  }

  /**
   * In this ClientTask, the target_id points to an Item which has been updated by the owner and so the owner must re-encrypt
   * the Item with each of the shared public keys.
   * @param listOfClientTasks A list of update_item_shares tasks to run.
   * @param authData
   */
  private async updateSharesClientTasks(
    credentials: IVaultToken & IKeystoreToken & IKEK & IDEK,
    tasks: ClientTask[]
  ): Promise<IClientTaskExecResult> {
    const shareService = new ShareService(this.environment);

    const taskReport: IClientTaskExecResult = {
      completed: [],
      failed: [],
    };

    const runTask = async (task: ClientTask) => {
      try {
        await shareService.updateSharedItem(credentials, task.target_id);
        task.state = ClientTaskState.Done;
        taskReport.completed.push(task);
      } catch (error) {
        this.logger.warn(`Task with id=${task.id} failed!`);
        task.state = ClientTaskState.Failed;
        taskReport.failed.push({ ...task, failureReason: error });
      }
    };

    // Set all tasks to in_progress
    await this.vaultAPIFactory(
      credentials.vault_access_token
    ).ClientTaskQueueApi.clientTaskQueuePut({
      client_tasks: tasks.map(({ id }) => ({ id, state: ClientTaskState.InProgress })),
    });
    this.logger.log('Set: in_progress');

    await Promise.all(tasks.map(runTask));

    // now update the tasks in the API
    this.logger.log(`Task run completed, updating.`);
    const allTasks = taskReport.completed
      .concat(taskReport.failed)
      .map(({ id, state, report }) => ({ id, state, report }));
    await this.vaultAPIFactory(
      credentials.vault_access_token
    ).ClientTaskQueueApi.clientTaskQueuePut({
      client_tasks: allTasks,
    });

    return taskReport;
  }
}

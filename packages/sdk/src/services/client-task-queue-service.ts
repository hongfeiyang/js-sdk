import { ClientTask, ClientTaskQueueApi, ClientTaskQueueResponse } from '@meeco/vault-api-sdk';
import { MeecoServiceError } from '../models/service-error';
import { getAllPaged, reducePages, resultHasNext } from '../util/paged';
import Service, { IDEK, IKEK, IKeystoreToken, IPageOptions, IVaultToken } from './service';
import { ShareService } from './share-service';

/**
 * A ClientTask represents a task the client is supposed to perform.
 */
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

export class ClientTaskQueueService extends Service<ClientTaskQueueApi> {
  public getAPI(token: IVaultToken): ClientTaskQueueApi {
    return this.vaultAPIFactory(token.vault_access_token).ClientTaskQueueApi;
  }

  public async list(
    credentials: IVaultToken,
    supressChangingClientTaskState: boolean = true,
    state: ClientTaskState = ClientTaskState.Todo,
    options?: IPageOptions
  ): Promise<ClientTaskQueueResponse> {
    const result = await this.vaultAPIFactory(
      credentials.vault_access_token
    ).ClientTaskQueueApi.clientTaskQueueGet(
      options?.nextPageAfter,
      options?.perPage,
      supressChangingClientTaskState,
      state
    );

    if (resultHasNext(result) && options?.perPage === undefined) {
      this.logger.warn('Some results omitted, but page limit was not explicitly set');
    }

    return result;
  }

  public async listAll(
    credentials: IVaultToken,
    supressChangingClientTaskState: boolean = true,
    state: ClientTaskState = ClientTaskState.Todo
  ): Promise<ClientTaskQueueResponse> {
    const api = this.vaultAPIFactory(credentials.vault_access_token).ClientTaskQueueApi;
    return getAllPaged(cursor =>
      api.clientTaskQueueGet(cursor, undefined, supressChangingClientTaskState, state)
    ).then(reducePages);
  }

  public async countOutstandingTasks(credentials: IVaultToken): Promise<IOutstandingClientTasks> {
    const api = this.vaultAPIFactory(credentials.vault_access_token).ClientTaskQueueApi;
    const todoTasks = await api.clientTaskQueueGet(
      undefined,
      undefined,
      true,
      ClientTaskState.Todo
    );

    const inProgressTasks = await api.clientTaskQueueGet(
      undefined,
      undefined,
      true,
      ClientTaskState.InProgress
    );

    return {
      todo: todoTasks.client_tasks.length,
      in_progress: inProgressTasks.client_tasks.length,
    };
  }

  public async executeClientTasks(
    credentials: IVaultToken & IKeystoreToken & IKEK & IDEK,
    listOfClientTasks: ClientTask[]
  ): Promise<IClientTaskExecResult> {
    const remainingClientTasks: ClientTask[] = [];
    const itemUpdateSharesTasks: ClientTask[] = [];
    for (const task of listOfClientTasks) {
      if (task.work_type !== 'update_item_shares') {
        throw new MeecoServiceError(
          `Do not know how to execute ClientTask of type ${task.work_type}`
        );
      }
    }
    if (remainingClientTasks.length) {
      throw new MeecoServiceError(
        `Do not know how to execute ClientTask of type ${remainingClientTasks[0].work_type}`
      );
    }
    const updateSharesTasksResult: IClientTaskExecResult = await this.updateSharesClientTasks(
      credentials,
      itemUpdateSharesTasks
    );

    return updateSharesTasksResult;
  }

  /**
   * In this ClientTask, the target_id points to an Item which has been updated by the owner and so the owner must re-encrypt
   * the Item with each of the shared public keys.
   * @param listOfClientTasks A list of update_item_shares tasks to run.
   * @param authData
   */
  public async updateSharesClientTasks(
    credentials: IVaultToken & IKeystoreToken & IKEK & IDEK,
    listOfClientTasks: ClientTask[]
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
        task.state = ClientTaskState.Failed;
        taskReport.failed.push({ ...task, failureReason: error });
      }
    };

    await Promise.all(listOfClientTasks.map(runTask));

    // now update the tasks in the API
    const allTasks = taskReport.completed
      .concat(taskReport.failed)
      .map(({ id, state, report }) => ({ id, state, report }));
    this.vaultAPIFactory(credentials.vault_access_token).ClientTaskQueueApi.clientTaskQueuePut({
      client_tasks: allTasks,
    });

    return taskReport;
  }
}

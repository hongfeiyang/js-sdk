import { ClientTask, ClientTaskQueueApi, ClientTaskQueueResponse } from '@meeco/vault-api-sdk';
import { AuthData } from '../models/auth-data';
import { EncryptionKey } from '../models/encryption-key';
import { MeecoServiceError } from '../models/service-error';
import { getAllPaged, reducePages, resultHasNext } from '../util/paged';
import { ItemService } from './item-service';
import Service from './service';
import { ShareService } from './share-service';

/**
 * A ClientTask represents a task the client is supposed to perform.
 */
interface IFailedClientTask extends ClientTask {
  failureReason: any;
}

export class ClientTaskQueueService extends Service<ClientTaskQueueApi> {
  public getAPI(vaultToken: string): ClientTaskQueueApi {
    return this.vaultAPIFactory(vaultToken).ClientTaskQueueApi;
  }

  public async list(
    vaultAccessToken: string,
    supressChangingState: boolean = true,
    state: State = State.Todo,
    options?: { nextPageAfter?: string; perPage?: number }
  ): Promise<ClientTaskQueueResponse> {
    const result = await this.getAPI(vaultAccessToken).clientTaskQueueGet(
      options?.nextPageAfter,
      options?.perPage,
      supressChangingState,
      state
    );

    if (resultHasNext(result) && options?.perPage === undefined) {
      this.logger.warn('Some results omitted, but page limit was not explicitly set');
    }

    return result;
  }

  public async listAll(
    vaultAccessToken: string,
    supressChangingState: boolean = true,
    state: State = State.Todo
  ): Promise<ClientTaskQueueResponse> {
    const api = this.getAPI(vaultAccessToken);
    return getAllPaged(cursor =>
      api.clientTaskQueueGet(cursor, undefined, supressChangingState, state)
    ).then(reducePages);
  }

  public async countOutstandingTasks(vaultAccessToken: string): Promise<IOutstandingClientTasks> {
    const api = this.getAPI(vaultAccessToken);
    const todoTasks = await api.clientTaskQueueGet(undefined, undefined, true, State.Todo);

    const inProgressTasks = await api.clientTaskQueueGet(
      undefined,
      undefined,
      true,
      State.InProgress
    );

    return {
      todo: todoTasks.client_tasks.length,
      in_progress: inProgressTasks.client_tasks.length,
    };
  }

  public async executeClientTasks(
    listOfClientTasks: ClientTask[],
    authData: AuthData
  ): Promise<{ completedTasks: ClientTask[]; failedTasks: ClientTask[] }> {
    const remainingClientTasks: ClientTask[] = [];
    const itemUpdateSharesTasks: ClientTask[] = [];
    for (const task of listOfClientTasks) {
      switch (task.work_type) {
        case 'update_item_shares':
          itemUpdateSharesTasks.push(task);
          break;
        default:
          remainingClientTasks.push(task);
          break;
      }
    }
    if (remainingClientTasks.length) {
      throw new MeecoServiceError(
        `Do not know how to execute ClientTask of type ${remainingClientTasks[0].work_type}`
      );
    }
    const updateSharesTasksResult: {
      completedTasks: ClientTask[];
      failedTasks: IFailedClientTask[];
    } = await this.updateSharesClientTasks(itemUpdateSharesTasks, authData);

    return updateSharesTasksResult;
  }

  public async updateSharesClientTasks(
    listOfClientTasks: ClientTask[],
    authData: AuthData
  ): Promise<{ completedTasks: ClientTask[]; failedTasks: IFailedClientTask[] }> {
    const sharesApi = this.vaultAPIFactory(authData.vault_access_token).SharesApi;
    const itemsApi = this.vaultAPIFactory(authData.vault_access_token).ItemApi;

    const taskReports = await Promise.all(
      listOfClientTasks.map(async task => {
        const taskReport = {
          completedTasks: <ClientTask[]>[],
          failedTasks: <IFailedClientTask[]>[],
        };
        try {
          const [item, shares] = await Promise.all([
            itemsApi.itemsIdGet(task.target_id),
            sharesApi.itemsIdSharesGet(task.target_id),
          ]);
          const decryptedSlots = await Promise.all(
            item.slots.map(s => ItemService.decryptSlot(s, authData.data_encryption_key))
          );
          const dek = Service.cryppo.generateRandomKey();
          const newEncryptedSlots = await new ShareService(
            this.environment
          ).convertSlotsToEncryptedValuesForShare(decryptedSlots, EncryptionKey.fromRaw(dek));
          const nestedSlotValues: any[] = shares.shares.map(share => {
            return newEncryptedSlots.map(newValue => {
              return { ...newValue, share_id: share.id };
            });
          });
          const slotValues = [].concat.apply([], nestedSlotValues);
          const shareDeks = await Promise.all(
            shares.shares.map(async share => {
              const encryptedDek = await Service.cryppo.encryptWithPublicKey({
                publicKeyPem: share.public_key,
                data: dek,
              });
              return { share_id: share.id, dek: encryptedDek.serialized };
            })
          );
          const clientTasks = [{ id: task.id, state: 'done', report: task.report }];
          await sharesApi.itemsIdSharesPut(task.target_id, {
            slot_values: slotValues,
            share_deks: shareDeks,
            client_tasks: clientTasks,
          });
          taskReport.completedTasks.push(task);
        } catch (error) {
          taskReport.failedTasks.push({ ...task, failureReason: error });
        }
        return taskReport;
      })
    );

    const combinedTaskReports = taskReports.reduce((accum, current) => {
      accum.completedTasks.concat(current.completedTasks);
      accum.failedTasks.concat(current.failedTasks);
      return accum;
    });

    return combinedTaskReports;
  }
}

export enum State {
  Todo = 'todo',
  InProgress = 'in_progress',
  Done = 'done',
  Failed = 'failed',
}

export interface IOutstandingClientTasks {
  todo: number;
  in_progress: number;
}

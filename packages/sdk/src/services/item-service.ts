// import * as MeecoAzure from '@meeco/azure-block-upload';
import { Item, ItemApi, ItemsResponse, Slot } from '@meeco/vault-api-sdk';
import { AuthData } from '../models/auth-data';
import { EncryptionKey } from '../models/encryption-key';
import { ItemCreateData } from '../models/item-create-data';
import { ItemUpdateData } from '../models/item-update-data';
import { DecryptedSlot, IDecryptedSlot } from '../models/local-slot';
import { MeecoServiceError } from '../models/service-error';
import { getAllPaged, reducePages, resultHasNext } from '../util/paged';
import {
  VALUE_VERIFICATION_KEY_LENGTH,
  valueVerificationHash,
  verifyHashedValue,
} from '../util/value-verification';
import Service from './service';

/**
 * Used for fetching and sending `Items` to and from the Vault.
 */
export class ItemService extends Service<ItemApi> {
  // for mocking during testing
  private static verifyHashedValue = (<any>global).verifyHashedValue || verifyHashedValue;
  private static valueVerificationHash =
    (<any>global).valueVerificationHash || valueVerificationHash;

  /**
   * True if the Item was received via a Share from another user.
   * In that case, it must be decrypted with the Share DEK, not the user's own DEK.
   * @param item
   */
  public static itemIsFromShare(item: Item): boolean {
    // this also implies item.own == false
    return item.share_id != null;
  }

  /**
   * Updates 'value' to the decrypted 'encrypted_value' and sets 'encrypted' to false.
   * @param slot
   * @param dek Data Encryption Key
   */
  public static async decryptSlot(slot: Slot, dek: EncryptionKey): Promise<IDecryptedSlot> {
    const value =
      slot.encrypted && slot.encrypted_value !== null // need to check encrypted_value as binaries will also have `encrypted: true`
        ? await Service.cryppo.decryptWithKey({
            key: dek.key,
            serialized: slot.encrypted_value,
          })
        : (slot as DecryptedSlot).value;

    let decryptedValueVerificationKey: string | undefined;

    if (value != null && !slot.own && slot.encrypted_value_verification_key != null) {
      decryptedValueVerificationKey = await Service.cryppo.decryptWithKey({
        serialized: slot.encrypted_value_verification_key,
        key: dek.key,
      });

      if (
        slot.value_verification_hash !== null &&
        !ItemService.verifyHashedValue(
          decryptedValueVerificationKey as string,
          value,
          slot.value_verification_hash
        )
      ) {
        throw new MeecoServiceError(
          `Decrypted slot ${slot.name} with value ${value} does not match original value.`
        );
      }
    }

    const decrypted = {
      ...slot,
      encrypted: false,
      value,
      value_verification_key: decryptedValueVerificationKey,
    };
    return decrypted;
  }

  /**
   * Encrypt the value in the Slot. Undefined values are not changed.
   *
   * After successful encryption, Slot.encrypted = true and Slot.value is deleted.
   * @param slot
   * @param dek Data Encryption Key
   */
  public static async encryptSlot<T extends { value?: string | null | undefined }>(
    slot: T,
    dek: EncryptionKey
  ): Promise<Omit<T, 'value'> & { encrypted: boolean; encrypted_value: string | undefined }> {
    const encrypted = {
      ...slot,
      encrypted: false,
      encrypted_value: undefined,
    };

    if (slot.value) {
      encrypted.encrypted_value = await Service.cryppo
        .encryptWithKey({
          strategy: Service.cryppo.CipherStrategy.AES_GCM,
          key: dek.key,
          data: slot.value,
        })
        .then(result => result.serialized);

      delete encrypted.value;
      encrypted.encrypted = true;
    }

    return encrypted;
  }

  public getAPI(vaultToken: string) {
    return this.vaultAPIFactory(vaultToken).ItemApi;
  }

  public async create(vaultAccessToken: string, dek: EncryptionKey, config: ItemCreateData) {
    const slots_attributes = await Promise.all(
      (config.slots || []).map(slot => ItemService.encryptSlot(slot, dek))
    );

    return await this.getAPI(vaultAccessToken).itemsPost({
      template_name: config.template_name,
      item: {
        label: config.item.label,
        slots_attributes,
      },
    });
  }

  public async update(vaultAccessToken: string, dek: EncryptionKey, config: ItemUpdateData) {
    const slots_attributes = await Promise.all(
      (config.slots || []).map(slot => ItemService.encryptSlot(slot, dek))
    );

    return await this.getAPI(vaultAccessToken).itemsIdPut(config.id, {
      item: {
        label: config.label,
        slots_attributes,
      },
    });
  }

  public async removeSlot(slotId: string, vaultAccessToken: string) {
    this.logger.log('Removing slot');
    await this.vaultAPIFactory(vaultAccessToken).SlotApi.slotsIdDelete(slotId);
    this.logger.log('Slot successfully removed');
  }

  public async get(id: string, user: AuthData) {
    const vaultAccessToken = user.vault_access_token;
    let dataEncryptionKey = user.data_encryption_key;

    const result = await this.getAPI(vaultAccessToken).itemsIdGet(id);
    const { item, slots } = result;

    // If the Item is from a share, use the share DEK to decrypt instead.
    if (ItemService.itemIsFromShare(item) && item.share_id !== null) {
      const share = await this.vaultAPIFactory(user)
        .SharesApi.incomingSharesIdGet(item.share_id)
        .then(response => response.share);

      const keyPairExternal = await this.keystoreAPIFactory(user).KeypairApi.keypairsIdGet(
        share.keypair_external_id!
      );

      const decryptedPrivateKey = await Service.cryppo.decryptWithKey({
        serialized: keyPairExternal.keypair.encrypted_serialized_key,
        key: user.key_encryption_key.key,
      });

      dataEncryptionKey = await Service.cryppo
        .decryptSerializedWithPrivateKey({
          privateKeyPem: decryptedPrivateKey,
          serialized: share.encrypted_dek,
        })
        .then(EncryptionKey.fromRaw);
    }

    const decryptedSlots = await Promise.all(
      slots.map(s => ItemService.decryptSlot(s, dataEncryptionKey))
    );

    return {
      ...result,
      slots: decryptedSlots,
    };
  }

  // TODO why is IDecryptedSlot != DecryptedSlot?

  /**
   * Add a verification hash and (encrypted) key to the Slot.
   * This is necessary to share an Item that you own.
   * If you do not own the Item, then just add the fields but leave them undefined.
   * @param slot
   * @param dek Data Encryption Key
   */
  public async addVerificationHash<T extends { own: boolean; value: string | undefined }>(
    slot: T,
    dek: EncryptionKey
  ): Promise<
    T & {
      value_verification_hash: string | undefined;
      encrypted_value_verification_key: string | undefined;
    }
  > {
    if (slot.own && slot.value) {
      const valueVerificationKey = Service.cryppo.generateRandomKey(
        VALUE_VERIFICATION_KEY_LENGTH
      ) as string;
      const verificationHash = ItemService.valueVerificationHash(valueVerificationKey, slot.value);
      const encryptedValueVerificationKey = await Service.cryppo
        .encryptWithKey({
          data: valueVerificationKey,
          key: dek.key,
          strategy: Service.cryppo.CipherStrategy.AES_GCM,
        })
        .then(result => result.serialized);

      return {
        ...slot,
        encrypted_value_verification_key: encryptedValueVerificationKey,
        value_verification_hash: verificationHash,
      };
    } else {
      return {
        ...slot,
        encrypted_value_verification_key: undefined,
        value_verification_hash: undefined,
      };
    }
  }

  public async list(
    vaultAccessToken: string,
    templateIds?: string,
    nextPageAfter?: string,
    perPage?: number
  ) {
    const result = await this.getAPI(vaultAccessToken).itemsGet(
      templateIds,
      undefined,
      undefined,
      nextPageAfter,
      perPage
    );

    if (resultHasNext(result) && perPage === undefined) {
      this.logger.warn('Some results omitted, but page limit was not explicitly set');
    }

    return result;
  }

  public async listAll(vaultAccessToken: string, templateIds?: string): Promise<ItemsResponse> {
    const api = this.getAPI(vaultAccessToken);

    return getAllPaged(cursor => api.itemsGet(templateIds, undefined, undefined, cursor)).then(
      reducePages
    );
  }
}

import { ItemTemplate, NestedSlotAttributes, PostItemsRequest, Slot } from '@meeco/vault-api-sdk';
import { ItemService } from '../services/item-service';
import { slotToNewSlot } from '../util/transformers';
import { EncryptionKey } from './encryption-key';
import { ItemChange } from './item-change';
import { findWithEncryptedValue, NewSlot } from './local-slot';

/** An Item which does not exist in the API */
export class NewItem extends ItemChange {
  public static fromTemplate(
    template: ItemTemplate,
    templateSlots: Slot[],
    label: string,
    extraSlots: NewSlot[] = []
  ): NewItem {
    return new NewItem(label, template.name, templateSlots.map(slotToNewSlot).concat(extraSlots));
  }

  /**
   * Required fields for creating a new Item.
   * @param label Must be non-empty string
   * @param template_name Must be non-empty string
   */
  constructor(
    public readonly label: string,
    public template_name: string,
    public slots: NewSlot[] = [],
    public classification_nodes = []
  ) {
    super(slots, classification_nodes);
    if (this.label === '') {
      throw new Error('Cannot create Item with empty label');
    }

    if (this.template_name === '') {
      throw new Error('Cannot create Item with empty template name');
    }
  }

  /**
   * constraints:
   * - each slot must have either a non-empty label or name
   * - slots may not have a 'value' field
   * - encrypted_value is either a cryppo formatted string or is not present
   * - slot type must be a valid type
   * @param dek
   */
  async toRequest(dek: EncryptionKey): Promise<PostItemsRequest> {
    const badValue = findWithEncryptedValue(this.slots);
    if (badValue) {
      throw new Error(
        `Slot ${badValue['name'] ||
          badValue['label']} with existing encrypted_value with be overwritten`
      );
    }
    // TODO should enforce map integrity?

    const slots_attributes: NestedSlotAttributes[] = await Promise.all(
      this.slots.map(slot => ItemService.encryptSlot({ data_encryption_key: dek }, slot))
    );

    return {
      template_name: this.template_name,
      item: {
        label: this.label,
        slots_attributes,
      },
    };
  }

}

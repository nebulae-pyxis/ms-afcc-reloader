import { DataBlockRequest } from "../../data-block-req";
import { MessageType } from '../../message-type';

export class GetSlotStatus extends DataBlockRequest {

  constructor(masterKey) {
    super(MessageType.GET_SLOT_STATUS_CMD, undefined);
  }

  public generateData() {
    return new Uint8Array(0);
  }

  isEncryptedMessage() {
    return true;
  }

}

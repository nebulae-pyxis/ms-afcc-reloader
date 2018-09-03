import { DataBlockRequest } from "../../data-block-req";
import { MessageType } from '../../message-type';

export class SphToRfrAuthResp extends DataBlockRequest {

  encryptedKey: Uint8Array;
  constructor(encryptedKey) {
    super(MessageType.ESCAPE_COMMAND_CMD, undefined);
    this.encryptedKey = encryptedKey;
  }

  public generateData() {
    return this.encryptedKey;
  }

  isEncryptedMessage() {
    return false;
  }

}

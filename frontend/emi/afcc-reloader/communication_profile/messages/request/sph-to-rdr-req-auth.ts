import { DataBlockRequest } from "../../data-block-req";
import { MessageType } from '../../message-type';

export class SphToRdrReqAuth extends DataBlockRequest {

  constructor() {
    super(MessageType.ESCAPE_COMMAND_CMD, undefined);
  }

  public generateData() {
    return new Uint8Array([0xE0, 0x00, 0x00, 0x45, 0x00]);
  }

  isEncryptedMessage() {
    return false;
  }
}

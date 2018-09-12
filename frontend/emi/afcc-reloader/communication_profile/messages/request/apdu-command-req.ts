import { DataBlockRequest } from '../../data-block-req';
import { MessageType } from '../../message-type';

export class ApduCommandReq extends DataBlockRequest {

  data: Uint8Array;
  constructor(data) {
    super(MessageType.APDU_COMMAND_CMD, undefined);
    this.data = data;
  }

  public generateData() {
    return this.data;
  }

  isEncryptedMessage() {
    return true;
  }

}

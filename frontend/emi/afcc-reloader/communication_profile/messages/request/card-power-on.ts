import { DataBlockRequest } from "../../data-block-req";
import { MessageType } from '../../message-type';

export class CardPowerOn extends DataBlockRequest {

  constructor(masterKey) {
    super(MessageType.CARD_POWER_ON_CMD, undefined);
  }

  public generateData() {
    return new Uint8Array(0);
  }

  isEncryptedMessage() {
    return true;
  }

}

import { MessageType } from '../../message-type';
import { ApduCommandReq } from './apdu-command-req';

export class DeviceUiidReq extends ApduCommandReq {

  constructor(data) {
    super(data);
  }
}

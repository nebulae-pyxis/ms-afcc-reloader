import { Injectable } from '@angular/core';
import { Commons } from '../utils/commons';
import { DataBlockRequest } from '../communication_profile/data-block-req';
import { CypherAesService } from '@nebulae/angular-ble';

@Injectable()
export class MessageReaderTranslatorService {

  constructor(
    private cypherAesService: CypherAesService
  ) {
    this.cypherAesService.config([
      0x41, 0x43, 0x52, 0x31, 0x32, 0x35, 0x35, 0x55, 0x2D, 0x4A, 0x31, 0x20, 0x41, 0x75, 0x74, 0x68
    ]);
  }
  generateMessageRequestFormat(dataBlockRequest: DataBlockRequest) {
    let dataBlock;
    if (dataBlockRequest.isEncryptedMessage()) {
      dataBlock = this.cypherAesService.encrypt(dataBlockRequest.getDataBlock());
    } else {
      dataBlock = dataBlockRequest.getDataBlock();
    }
    dataBlockRequest.dataBlock = dataBlock;
    return Commons.concatenate(
      dataBlockRequest.startByte,
      dataBlockRequest.getDeviceMessageLenght(),
      dataBlock,
      dataBlockRequest.generateDeviceMessageXOR(),
      dataBlockRequest.stopByte
    );
  }

}

import { Injectable } from '@angular/core';
import { Commons } from '../utils/commons';
import * as Rx from 'rxjs';
import { DataBlockRequest } from '../communication_profile/data-block-req';
import { CypherAesService, BluetoothService } from '@nebulae/angular-ble';
import { GattService } from './gatt-services';
import { map, mergeMap } from 'rxjs/operators';
import { AfccReloaderService } from '../afcc-reloader.service';
import { SphToRdrReqAuth } from '../communication_profile/messages/request/sph-to-rdr-req-auth';
import { MessageReaderTranslatorService } from './message-reader-translator.service';
import { MessageType } from '../communication_profile/message-type';
import { SphToRfrAuthResp } from '../communication_profile/messages/request/sph-to-rfr-auth-resp';

@Injectable()
export class AuthReaderService {
  rndA;
  rndB;
  sessionKey;
  constructor(
    public cypherAesService: CypherAesService,
    private bluetoothService: BluetoothService,
    private messageReaderTranslator: MessageReaderTranslatorService
  ) {
    this.cypherAesService.config([
      0x41, 0x43, 0x52, 0x31, 0x32, 0x35, 0x35, 0x55, 0x2D, 0x4A, 0x31, 0x20, 0x41, 0x75, 0x74, 0x68
    ]);
  }

  changeCypherMasterKey(masterKey) {
    this.sessionKey = masterKey;
    this.cypherAesService.changeMasterKey(this.sessionKey);
  }

  sendAuthPhaseOne$() {
    return this.bluetoothService
      .sendAndWaitResponse$(
        this.messageReaderTranslator.generateMessageRequestFormat(new SphToRdrReqAuth()),
        GattService.NOTIFIER.SERVICE,
        GattService.NOTIFIER.WRITER,
        [{ position: 3, byteToMatch: MessageType.ESCAPE_COMMAND_RESP }, { position: 13, byteToMatch: 0x45 }]
      );
  }

  sendAuthPhaseTwo$(authPhaseOneResp) {
    this.rndA = this.cypherAesService.decrypt(authPhaseOneResp.data);
    this.rndB = window.crypto.getRandomValues(new Uint8Array(16));
    const rndC = this.cypherAesService.decrypt(Commons.concatenate(this.rndB, this.rndA));
    const messageData = Commons.concatenate(new Uint8Array([0xe0, 0x00, 0x00, 0x46, 0x00]), rndC);
    return this.bluetoothService
      .sendAndWaitResponse$(
      this.messageReaderTranslator.generateMessageRequestFormat(new SphToRfrAuthResp(messageData)),
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.ESCAPE_COMMAND_RESP }, { position: 13, byteToMatch: 0x46 }]
      );
   }

}

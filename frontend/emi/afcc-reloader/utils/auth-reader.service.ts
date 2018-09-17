import { Injectable } from '@angular/core';
import { Commons } from '../utils/commons';
import * as Rx from 'rxjs';
import { DataBlockRequest } from '../communication_profile/data-block-req';
import { CypherAesService, BluetoothService } from '@nebulae/angular-ble';
import { GattService } from './gatt-services';
import { map, mergeMap } from 'rxjs/operators';
import { RdrToSphAuthRsp1 } from '../communication_profile/messages/response/rdr-to-sph-auth-resp1';
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

  private sendAuthPhaseOne$() {
    return this.bluetoothService
      .sendAndWaitResponse$(
        this.messageReaderTranslator.generateMessageRequestFormat(new SphToRdrReqAuth()),
        GattService.NOTIFIER.SERVICE,
        GattService.NOTIFIER.WRITER,
        [{ position: 3, byteToMatch: MessageType.ESCAPE_COMMAND_RESP }, { position: 13, byteToMatch: 0x45 }]
      );
  }

  private sendAuthPhaseTwo$(authPhaseOneResp) {
    this.rndA = this.cypherAesService.decrypt(authPhaseOneResp.data);
    console.log('llega llave desde la lectora: ', this.cypherAesService.bytesTohex(this.rndA));
    this.rndB = window.crypto.getRandomValues(new Uint8Array(16));
    console.log('se genera llave random: ', this.cypherAesService.bytesTohex(this.rndB));
    const rndC = this.cypherAesService.decrypt(Commons.concatenate(this.rndB, this.rndA));
    console.log('se realiza union de llaves: ', this.cypherAesService.bytesTohex(rndC));
    const messageData = Commons.concatenate(new Uint8Array([0xe0, 0x00, 0x00, 0x46, 0x00]), rndC);
    return this.bluetoothService
      .sendAndWaitResponse$(
      this.messageReaderTranslator.generateMessageRequestFormat(new SphToRfrAuthResp(messageData)),
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.ESCAPE_COMMAND_RESP }, { position: 13, byteToMatch: 0x46 }]
      );
  }

   /**
   * Realice all the process to authenticate with the reader
   */
  startAuthReader$() {
    return this.sendAuthPhaseOne$().pipe(
      map(authPhaseOneResp => new RdrToSphAuthRsp1(authPhaseOneResp)),
      mergeMap(authPhaseOneRespFormated => {
        console.log('Se inicia paso dos de autenticación');
        return this.sendAuthPhaseTwo$(
          authPhaseOneRespFormated
        );
      })
    );
  }

  /**
   * Start the bluetooth notifiers necesaries to use in all the operation
   */
  startNotifiersListener$() {
    return this.bluetoothService.startNotifierListener$(
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.READER,
      {
        startByte: 0x05,
        stopByte: 0x0a,
        lengthPosition: { start: 1, end: 3, lengthPadding: 5 }
      }
    );
  }

  /**
   * Stop all bluetooth notifiers
   */
  stopNotifiersListeners$() {
    console.log('Se llama metodo stopNotifiersListner$!!!!!!!!!!');
    return this.bluetoothService.stopNotifierListener$(
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.READER
    );
  }


}

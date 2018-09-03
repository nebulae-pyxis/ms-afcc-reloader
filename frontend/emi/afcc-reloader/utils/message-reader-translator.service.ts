import { Injectable } from '@angular/core';
import { Commons } from '../utils/commons';
import * as Rx from 'rxjs';
import { DataBlockRequest } from '../communication_profile/data-block-req';
import { CypherAesService, BluetoothService } from '@nebulae/angular-ble';
import { GattService } from './gatt-services';
import { map, mergeMap } from 'rxjs/operators';
import { AfccReloaderService } from '../afcc-reloader.service';

@Injectable()
export class MessageReaderTranslatorService {
  private _messageNotifier = new Rx.Subject<any>();
  private responseList = [];
  private responseLenght: Number;

  constructor(
    private cypherAesService: CypherAesService,
    private bluetoothService: BluetoothService,
    private afccReloaderService: AfccReloaderService
  ) {
    this.cypherAesService.config([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
    ]);
  }
  generateMessageRequestFormat(dataBlockRequest: DataBlockRequest) {
    let dataBlock;
    if (dataBlockRequest.isEncryptedMessage()) {
      dataBlock = this.cypherAesService.encrypt(dataBlockRequest.dataBlock);
    } else {
      dataBlock = dataBlockRequest.dataBlock;
    }
    const message = Commons.concatenate(
      dataBlockRequest.startByte,
      dataBlockRequest.getDeviceMessageLenght(),
      dataBlock,
      dataBlockRequest.generateDeviceMessageXOR(),
      dataBlockRequest.stopByte
    );
    return message;
  }

  startNotifierListener() {
    this.bluetoothService
      .startNotifierListener$(
        GattService.NOTIFIER.SERVICE,
        GattService.NOTIFIER.READER
      )
      .pipe(
        map(dataView => new Uint8Array(dataView.buffer)),
      map(dataBytes => {
          // Save the partial message in an array
          dataBytes.forEach(res => {
            this.responseList.push(res);
          });
          return this.responseList;
        }),
      mergeMap(response => {
        // get the message lenght
        if (this.responseList.length < 1) {
          this.responseLenght =
            new DataView(new Uint8Array(response.slice(1, 3)).buffer).getInt16(0, false) + 5;
        }
        // if is a complete message, returns the list containing the message, otherwise it returns undefined
        if (
          this.responseLenght <= this.responseList.length &&
          this.responseList[this.responseList.length - 1] === 0x0a
        ) {
          return this.translateMessageResponse$(this.responseList);
        }
        else {
          return Rx.of(undefined);
        }
        })
      )
      .subscribe(message => {
        console.log('llega mensaje: ', message);
      });
  }

  private translateMessageResponse$(responseList) {
    this.responseList = [];
    return this.afccReloaderService._deviceConnectionStatus.pipe(
      map(connectionStatus => {
        console.log('connectionStatus: ', connectionStatus);
        console.log('responseList: ', responseList);
        return connectionStatus;
      })
    );
  }

}

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import * as Rx from 'rxjs';
import { BluetoothService } from '@nebulae/angular-ble';
import { ConnectionStatus } from './connection-status';
import { mergeMap, map, switchMap } from 'rxjs/operators';
import { GattService } from './utils/gatt-services';
import { MessageReaderTranslatorService } from './utils/message-reader-translator.service';
import { SphToRdrReqAuth } from './communication_profile/messages/request/sph-to-rdr-req-auth';
import { CypherAesService } from '@nebulae/angular-ble';
import { MessageType } from './communication_profile/message-type';
import { RdrToSphAuthRsp1 } from './communication_profile/messages/response/rdr-to-sph-auth-resp1';
import { AuthReaderService } from './utils/auth-reader.service';
import { Commons } from './utils/commons';
import { ApduCommandReq } from './communication_profile/messages/request/apdu-command-req';
import { CardPowerOn } from './communication_profile/messages/request/card-power-on';
import { DeviceUiidReq } from './communication_profile/messages/request/device-uiid-req';
import { CardPowerOff } from './communication_profile/messages/request/card-power-off';

@Injectable()
export class AfccReloaderService {
  _deviceConnectionStatus = new Rx.BehaviorSubject<String>('DISCONNECTED');
  currentDevice: any;
  private initiatedNotifierList = [];
  deviceStartIdleSubscription = new Rx.Subscription;
  deviceStopIdleSubscription = new Rx.Subscription;
  uiid;
  constructor(
    private bluetoothService: BluetoothService,
    private messageReaderTranslator: MessageReaderTranslatorService,
    public authReaderService: AuthReaderService
  ) {
    this.bluetoothService.getDevice$().subscribe(device => {
      if (!device) {
        this._deviceConnectionStatus.next(ConnectionStatus.DISCONNECTED);
      }
      this.currentDevice = device;
    });
  }

  changeDeviceConnectionStatus(status) {
    this._deviceConnectionStatus.next(status);
  }

  deviceConnectionStatusListener$() {
    return this._deviceConnectionStatus.asObservable();
  }

  stablishNewConnection$() {
    return this.bluetoothService.connectDevice$({
      optionalServices: [GattService.NOTIFIER.SERVICE],
      filters: [{ namePrefix: 'ACR' }]
    });
  }

  startAuthReader$() {
    this.startNotifierListener();
    return this.authReaderService.sendAuthPhaseOne$().pipe(
      map(authPhaseOneResp => new RdrToSphAuthRsp1(authPhaseOneResp)),
      mergeMap(authPhaseOneRespFormated => {
        return this.authReaderService.sendAuthPhaseTwo$(
          authPhaseOneRespFormated
        );
      })
    );
  }

  onConnectionSuccessful() {
    this.authReaderService.changeCypherMasterKey(Array.
      from(Commons.concatenate(this.authReaderService.rndA.slice(0, 8), this.authReaderService.rndB.slice(0, 8))));
    this._deviceConnectionStatus.next(ConnectionStatus.CONNECTED);
    // Start the reader connection status listeners
    this.deviceStartIdleSubscription = this.bluetoothService
      .subscribeToNotifierListener([{ position: 3, byteToMatch: 0x52 }], this.authReaderService.sessionKey)
      .subscribe(sleepModeMessage => {
        this._deviceConnectionStatus.next(ConnectionStatus.IDLE);
      });
    this.deviceStopIdleSubscription = this.bluetoothService
      .subscribeToNotifierListener([{ position: 3, byteToMatch: 0x50 }], this.authReaderService.sessionKey)
      .subscribe(sleepModeMessage => {
        this._deviceConnectionStatus.next(ConnectionStatus.CONNECTED);
      });
  }

  onConnectionLost() {
    this.authReaderService.changeCypherMasterKey([
      0x41, 0x43, 0x52, 0x31, 0x32, 0x35, 0x35, 0x55, 0x2D, 0x4A, 0x31, 0x20, 0x41, 0x75, 0x74, 0x68
    ]);
    this.deviceStartIdleSubscription.unsubscribe();
    this.deviceStopIdleSubscription.unsubscribe();
  }

  startNotifierListener() {
    this.bluetoothService
      .startNotifierListener$(
        GattService.NOTIFIER.SERVICE,
        GattService.NOTIFIER.READER,
        {
          startByte: 0x05,
          stopByte: 0x0a,
          lengthPosition: { start: 1, end: 3, lengthPadding: 5 }
        }
      )
      .pipe()
      .subscribe(result => {
        this.initiatedNotifierList.push({
          service: GattService.NOTIFIER.SERVICE,
          characteristic: GattService.NOTIFIER.READER
        });
      });
  }

  getBatteryLevel$() {
    return this.bluetoothService.getBatteryLevel$();
  }

  cardPowerOn$() {
    const cardPoweOnReq = new CardPowerOn(new Uint8Array(0));
    const message = this.messageReaderTranslator.generateMessageRequestFormat(cardPoweOnReq);
    return this.bluetoothService
    .sendAndWaitResponse$(
      message,
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.CARD_POWER_ON_RESP }],
      this.authReaderService.sessionKey
    );
  }

  cardPowerOff$() {
    const cardPoweOffReq = new CardPowerOff(new Uint8Array(0));
    const message = this.messageReaderTranslator.generateMessageRequestFormat(cardPoweOffReq);
    return this.bluetoothService
    .sendAndWaitResponse$(
      message,
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.CARD_POWER_OFF_RESP }],
      this.authReaderService.sessionKey
    );
  }

  getUiid$() {
    const uiidReq = new DeviceUiidReq(new Uint8Array([0xFF, 0xCA, 0x00, 0x00, 0x00]));
    const message = this.messageReaderTranslator.generateMessageRequestFormat(uiidReq);
    console.log('datablock sin formatear: ',
      this.authReaderService.cypherAesService.bytesTohex(
         this.authReaderService.cypherAesService.decrypt(
        new Uint8Array(Array.from(message).slice(3, -2))
    )
    )
    );
    return this.bluetoothService
    .sendAndWaitResponse$(
      message,
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.GET_UIID_RESP }],
      this.authReaderService.sessionKey
    );
  }
}

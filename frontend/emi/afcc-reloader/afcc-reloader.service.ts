import { Injectable } from '@angular/core';
import * as Rx from 'rxjs';
import { BluetoothService } from '@nebulae/angular-ble';
import { ConnectionStatus } from './connection-status';
import { mergeMap, map } from 'rxjs/operators';
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
import { DeviceConnectionStatus } from './communication_profile/messages/response/device-connection-status';

@Injectable({
  providedIn: 'root'
})
export class AfccReloaderService {
  deviceConnectionStatus$ = new Rx.BehaviorSubject<String>('DISCONNECTED');
  startNewConnection = new Rx.Subject();
  currentDevice: any;
  deviceStartIdleSubscription = new Rx.Subscription();
  deviceStopIdleSubscription = new Rx.Subscription();
  uiid;
  constructor(
    private bluetoothService: BluetoothService,
    private messageReaderTranslator: MessageReaderTranslatorService,
    public authReaderService: AuthReaderService
  ) {
  }

  getDevice$() {
    return this.bluetoothService.getDevice$();
  }

  stablishNewConnection$() {
    return this.bluetoothService.connectDevice$({
      optionalServices: [GattService.NOTIFIER.SERVICE],
      filters: [{ namePrefix: 'ACR' }]
    });
  }

  disconnectDevice() {
    this.bluetoothService.disconnectDevice();
  }

  startAuthReader$() {
    return this.authReaderService.sendAuthPhaseOne$().pipe(
      map(authPhaseOneResp => new RdrToSphAuthRsp1(authPhaseOneResp)),
      mergeMap(authPhaseOneRespFormated => {
        return this.authReaderService.sendAuthPhaseTwo$(
          authPhaseOneRespFormated
        );
      })
    );
  }

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

  onConnectionSuccessful$() {
    return Rx.defer(() => {
      this.authReaderService.changeCypherMasterKey(
        Array.from(
          Commons.concatenate(
            this.authReaderService.rndA.slice(0, 8),
            this.authReaderService.rndB.slice(0, 8)
          )
        )
      );
      this.deviceConnectionStatus$.next(ConnectionStatus.CONNECTED);
      return Rx.of('connection succeful');
    });
  }

  listenDeviceConnectionChanges$() {
    return Rx.merge(
      this.bluetoothService.subscribeToNotifierListener(
        [{ position: 3, byteToMatch: MessageType.START_IDLE_STATUS }],
        this.authReaderService.sessionKey
      ),
      this.bluetoothService.subscribeToNotifierListener(
        [{ position: 3, byteToMatch: MessageType.STOP_IDLE_STATUS }],
        this.authReaderService.sessionKey
      )
    ).pipe(
      map(message => {
        const deviceConnectionStatusResp = new DeviceConnectionStatus(message);
        switch (deviceConnectionStatusResp.cmdMessageType) {
          // this case represents MessageType.START_IDLE_STATUS
          case '52':
            return ConnectionStatus.IDLE;
          // this case represents MessageType.STOP_IDLE_STATUS
          case '50':
            return ConnectionStatus.CONNECTED;
        }
      })
    );
   }

  onConnectionLost() {
    this.authReaderService.changeCypherMasterKey([
      0x41,
      0x43,
      0x52,
      0x31,
      0x32,
      0x35,
      0x35,
      0x55,
      0x2d,
      0x4a,
      0x31,
      0x20,
      0x41,
      0x75,
      0x74,
      0x68
    ]);
  }

  getBatteryLevel$() {
    return this.bluetoothService.getBatteryLevel$();
  }

  cardPowerOn$() {
    const cardPoweOnReq = new CardPowerOn(new Uint8Array(0));
    const message = this.messageReaderTranslator.generateMessageRequestFormat(
      cardPoweOnReq
    );
    return this.bluetoothService.sendAndWaitResponse$(
      message,
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.CARD_POWER_ON_RESP }],
      this.authReaderService.sessionKey
    );
  }

  cardPowerOff$() {
    const cardPoweOffReq = new CardPowerOff(new Uint8Array(0));
    const message = this.messageReaderTranslator.generateMessageRequestFormat(
      cardPoweOffReq
    );
    return this.bluetoothService.sendAndWaitResponse$(
      message,
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.CARD_POWER_OFF_RESP }],
      this.authReaderService.sessionKey
    );
  }

  getUiid$() {
    const uiidReq = new DeviceUiidReq(
      new Uint8Array([0xff, 0xca, 0x00, 0x00, 0x00])
    );
    const message = this.messageReaderTranslator.generateMessageRequestFormat(
      uiidReq
    );
    return this.bluetoothService.sendAndWaitResponse$(
      message,
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.GET_UIID_RESP }],
      this.authReaderService.sessionKey
    );
  }
}

import { Injectable } from '@angular/core';
import * as Rx from 'rxjs';
import { BluetoothService } from '@nebulae/angular-ble';
import { ConnectionStatus } from './connection-status';
import { mergeMap, map, filter, first, tap } from 'rxjs/operators';
import { GattService } from './utils/gatt-services';
import { MessageReaderTranslatorService } from './utils/message-reader-translator.service';
import { MessageType } from './communication_profile/message-type';

import { AuthReaderService } from './utils/auth-reader.service';
import { Commons } from './utils/commons';
import { CardPowerOn } from './communication_profile/messages/request/card-power-on';
import { DeviceUiidReq } from './communication_profile/messages/request/device-uiid-req';
import { CardPowerOff } from './communication_profile/messages/request/card-power-off';
import { DeviceConnectionStatus } from './communication_profile/messages/response/device-connection-status';
import { DeviceUiidResp } from './communication_profile/messages/response/device-uiid-resp';
import { GatewayService } from '../../../api/gateway.service';
import { reloadAfcc } from './gql/AfccReloader';

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
    private authReaderService: AuthReaderService,
    private gateway: GatewayService
  ) {}
  /**
   * Get the current device connected in bluetooth
   */
  getDevice$() {
    return this.bluetoothService.getDevice$();
  }

  /**
   * Discover and stablish a connection with a device
   */
  stablishNewConnection$() {
    return this.bluetoothService.connectDevice$({
      optionalServices: [GattService.NOTIFIER.SERVICE],
      filters: [{ namePrefix: 'ACR' }]
    });
  }

  /**
   * disconnect from the current device
   */
  disconnectDevice() {
    this.bluetoothService.disconnectDevice();
  }

  /**
   * change the reader key to the session key and change the state to connected
   */
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

  /**
   * lestien the reader connection status
   */
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
  /**
   * change the session key to the reader key
   */
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
    this.disconnectDevice();
  }

  /**
   * get the current device battery level
   */
  getBatteryLevel$() {
    return this.bluetoothService.getBatteryLevel$();
  }
  /**
   * get the uiid of the current card
   */
  requestAfccCard$() {
    return this.deviceConnectionStatus$.pipe(
      filter(
        connectionStatus => connectionStatus === ConnectionStatus.CONNECTED
      ),
      first(),
      mergeMap(() => {
        // start the read process in the reader
        return this.cardPowerOn$().pipe(
          mergeMap(resultPowerOn => {
            // TODO: aqui se puede tomar el ATR en el data
            // get the uiid of the current card
            return this.getUiid$();
          }),
          mergeMap(resultUiid =>
            // close the read process in the reader
            this.cardPowerOff$().pipe(
              map(_ => {
                const resp = new DeviceUiidResp(resultUiid);
                // TODO: GET AND CONVERT ALL DATA OF CARD HERE
                return this.authReaderService.cypherAesService.bytesTohex(
                  resp.data.slice(0, -2)
                );
              })
            )
          )
        );
      })
    );
  }
  /**
   * start the read process in the reader
   */
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
  /**
   * close the read process in the reader
   */
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
  /**
   * get the uiid of the current card
   */
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

  afccReload$(afcc, amount) {
    console.log('llega amount: ', amount);
    return this.gateway.apollo.mutate<any>({
      mutation: reloadAfcc,
      variables: {
        input: {
          id: 'sdfsdfqw423423',
          cardUiid: 'sdfs342wdvv',
          currentBalance: 2000,
          cardMapping: 'cardMappingSample',
          amount: amount
        }
      },
      errorPolicy: 'all'
    });
  }
}

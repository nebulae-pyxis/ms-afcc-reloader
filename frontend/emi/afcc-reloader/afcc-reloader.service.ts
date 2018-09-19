import { Injectable } from '@angular/core';
import * as Rx from 'rxjs';
import { BluetoothService } from '@nebulae/angular-ble';
import { ConnectionStatus } from './connection-status';
import {
  mergeMap,
  map,
  filter,
  first,
  tap,
  mapTo,
  switchMap,
  takeUntil,
  catchError
} from 'rxjs/operators';
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
import { MatSnackBar } from '@angular/material';

@Injectable({
  providedIn: 'root'
})
export class AfccReloaderService {
  deviceConnectionStatus$ = new Rx.BehaviorSubject<String>('DISCONNECTED');
  batteryLevel$ = new Rx.BehaviorSubject<any>(0);
  deviceName$ = new Rx.BehaviorSubject<String>('Venta carga tarjetas');
  startNewConnection = new Rx.Subject();
  currentDevice: any;
  deviceStartIdleSubscription = new Rx.Subscription();
  deviceStopIdleSubscription = new Rx.Subscription();
  uiid;
  constructor(
    private bluetoothService: BluetoothService,
    private messageReaderTranslator: MessageReaderTranslatorService,
    private authReaderService: AuthReaderService,
    private gateway: GatewayService,
    private snackBar: MatSnackBar,
  ) {}
  /**
   * Get the current device connected in bluetooth
   */
  getDevice$() {
    return this.bluetoothService.getDevice$();
  }

  stablishNewConnection$() {
    this.deviceConnectionStatus$.next(ConnectionStatus.CONNECTING);
    // Discover and connect to a device
    return this.bluetoothService
      .connectDevice$({
        optionalServices: [GattService.NOTIFIER.SERVICE],
        filters: [{ namePrefix: 'ACR' }]
      })
      .pipe(
        mergeMap(gattServer => {
          return Rx.forkJoin(
            // get the current battery lever of the connected device
            this.getBatteryLevel$().pipe(
              tap(batteryLevel => {
                this.batteryLevel$.next(batteryLevel);
              })
            ),
            // Start all bluetooth notifiers to the operation
            this.authReaderService.startNotifiersListener$()
          ).pipe(mapTo(gattServer));
        }),
        tap(server => {
          this.deviceName$.next(
            `Disp: ${(server as BluetoothRemoteGATTServer).device.name}`
          );
        }),
        // Start the auth process with the reader
        mergeMap(_ => this.authReaderService.startAuthReader$()),
        tap(() => console.log('Finaliza Auth con la lectora')),
        // if all the auth process finalize correctly, change the key and the current connection status
        switchMap(() => this.onConnectionSuccessful$()),
        tap(() => console.log('Finaliza proceso de conexion')),
        mergeMap(() =>
          // Start the a listener with the status of the reader
          this.listenDeviceConnectionChanges$()
        ),
        tap(() => console.log('Finaliza creación de escuchadores')),
        takeUntil(
          // end all the process if the connection with the device is lost
          this.getDevice$().pipe(
            filter(device => device === undefined || device === null),
            tap(dev => console.log('Pasa filtro y procede a desconectarse')),
            mergeMap(() => this.authReaderService.stopNotifiersListeners$())
          )
        ),
        catchError(error => {
          if (error.toString().includes('Bluetooth adapter not available')) {
            this.openSnackBar('Bluetooth no soportado en este equipo');
          } else {
            this.openSnackBar(
              'Fallo al establecer conexión, intentelo nuevamente'
            );
          }
          this.disconnectDevice();
          return Rx.of(error);
        })
      );
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
    this.authReaderService.changeCypherMasterKey(
      this.authReaderService.keyReader
    );
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
            console.log('LLEGA RESP CARD POWER ON ==========> ', this.authReaderService.cypherAesService.bytesTohex(resultPowerOn));
            // TODO: aqui se puede tomar el ATR en el data
            // get the uiid of the current card
            return this.getUiid$();
          }),
          map(resultUiid => {
            console.log('LLEGA RESP UID 2 ==========> ', this.authReaderService.cypherAesService.bytesTohex(resultUiid));
            const resp = new DeviceUiidResp(resultUiid);
            const uiid = this.authReaderService.cypherAesService.bytesTohex(
              resp.data.slice(0, -2)
            );
            // close the read process in the reader
            return uiid;
          }
          ),
          mergeMap(uiid => {
            return this.cardPowerOff$().pipe(
              map(cardPoweOff => {
                console.log('LLEGA UID: ', uiid);
                console.log('LLEGA RESP POWER OFF ==========> ', this.authReaderService.cypherAesService.bytesTohex(cardPoweOff));
                // TODO: GET AND CONVERT ALL DATA OF CARD HERE
                return uiid;
              })
            );
          })
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

  openSnackBar(text) {
    this.snackBar.open(text, 'Cerrar', { duration: 2000 });
  }
}

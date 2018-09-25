import { Injectable } from '@angular/core';
import * as Rx from 'rxjs';
import { BluetoothService, CypherAesService } from '@nebulae/angular-ble';
import { ConnectionStatus } from './connection-status';
import {
  mergeMap,
  map,
  filter,
  tap,
  switchMap,
  takeUntil
} from 'rxjs/operators';
import { MessageReaderTranslatorService } from './utils/message-reader-translator.service';
import { GatewayService } from '../../../api/gateway.service';
import { reloadAfcc } from './gql/AfccReloader';
import { MatSnackBar } from '@angular/material';
import { ReaderAcr1255 } from './utils/readers/reader-acr1255';
import { getMasterKeyReloader } from './gql/AfccReloader';
import { MyfarePlusSl3 } from './utils/cards/mifare-plus-sl3';

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
  readerAcr1255: ReaderAcr1255;
  myfarePlusSl3: MyfarePlusSl3;
  sessionKey;
  keyReader;

  constructor(
    private bluetoothService: BluetoothService,
    private messageReaderTranslator: MessageReaderTranslatorService,
    private gateway: GatewayService,
    private snackBar: MatSnackBar,
    private cypherAesService: CypherAesService
  ) {
    this.readerAcr1255 = new ReaderAcr1255();
    this.myfarePlusSl3 = new MyfarePlusSl3();
  }

  // #region Authentication ACR1255

  getKeyReaderAndConfigCypherData$() {
    return this.gateway.apollo
      .query<any>({
        query: getMasterKeyReloader,
        errorPolicy: 'all'
      })
      .pipe(
        map(result => {
          return result.data.getMasterKeyReloader.key;
        }),
        tap(key => {
          this.keyReader = key;
          this.cypherAesService.config(key);
        })
      );
  }

  changeCypherMasterKey(masterKey) {
    this.sessionKey = masterKey;
    this.cypherAesService.changeMasterKey(this.sessionKey);
  }

  // #endregion

  // #region General Utils ACR1255

  /**
   * Get the current device connected in bluetooth
   */
  getDevice$() {
    return this.bluetoothService.getDevice$();
  }
  /**
   * get the current device battery level
   */
  getBatteryLevel$() {
    return this.bluetoothService.getBatteryLevel$();
  }

  // #endregion

  // #region CONNECTION ACR1255
  stablishNewConnection$() {
    this.deviceConnectionStatus$.next(ConnectionStatus.CONNECTING);
    // Discover and connect to a device
    return this.readerAcr1255
      .stablishNewConnection$(
        this.bluetoothService,
        this.cypherAesService,
        this.batteryLevel$,
        this.deviceName$
      )
      .pipe(
        // if all the auth process finalize correctly, change the key and the current connection status
        switchMap(sessionKey => this.onConnectionSuccessful$(sessionKey)),
        mergeMap(() =>
          // Start the a listener with the status of the reader
          this.readerAcr1255.listenDeviceConnectionChanges$(
            this.bluetoothService,
            this.sessionKey
          )
        ),
        takeUntil(
          // end all the process if the connection with the device is lost
          this.getDevice$().pipe(
            filter(device => device === undefined || device === null),
            mergeMap(() =>
              this.readerAcr1255.stopNotifiersListeners$(this.bluetoothService)
            )
          )
        )
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
  onConnectionSuccessful$(sessionKey) {
    return Rx.defer(() => {
      this.changeCypherMasterKey(Array.from(sessionKey));
      this.deviceConnectionStatus$.next(ConnectionStatus.CONNECTED);
      return Rx.of('connection succeful');
    });
  }

  /**
   * change the session key to the reader key
   */
  onConnectionLost() {
    this.changeCypherMasterKey(this.keyReader);
    this.disconnectDevice();
  }

  // #endregion

  // #region AUTH CARD MIFARE SL3
  /**
   * get the uiid of the current card
   */
  requestAfccCard$() {
    console.log(
      'Se inica Autenticacion con la llave de sesion: ',
      this.sessionKey
    );
    return this.myfarePlusSl3.authWithCard$(
      this.bluetoothService,
      this.readerAcr1255,
      this.sessionKey,
      this.cypherAesService,
      this.deviceConnectionStatus$,
      this.gateway
    );
  }
  // #endregion

  // #region READ CARD MIFARE SL3

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

  // #endregion
}

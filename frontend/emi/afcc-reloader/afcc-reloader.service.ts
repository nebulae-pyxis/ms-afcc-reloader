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

@Injectable()
export class AfccReloaderService {
  _deviceConnectionStatus = new Rx.BehaviorSubject<String>('DISCONNECTED');
  currentDevice: any;

  constructor(
    private bluetoothService: BluetoothService,
    private messageReaderTranslator: MessageReaderTranslatorService
  ) {
    this.bluetoothService.getDevice$().subscribe(device => {
      this._deviceConnectionStatus.next(
        device ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
      );
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
    return this.bluetoothService
      .connectDevice$({
        optionalServices: [GattService.NOTIFIER.SERVICE],
        filters: [{ namePrefix: 'ACR' }]
      })
      .pipe(
        mergeMap(gattServer => {
          return this.getBatteryLevel$().pipe(
            map(batteryLevel => [gattServer, batteryLevel])
          );
        })
      );
  }

  startAuthReader() {
    this.messageReaderTranslator.startNotifierListener();
    const authPhaseOne = new SphToRdrReqAuth();
      this.bluetoothService
        .sendToNotifier$(
          this.messageReaderTranslator.generateMessageRequestFormat(
            authPhaseOne
          ),
          GattService.NOTIFIER.SERVICE,
          GattService.NOTIFIER.WRITER
        )
        .subscribe(_ => {});
  }

  getBatteryLevel$() {
    return this.bluetoothService.getBatteryLevel$();
  }
}

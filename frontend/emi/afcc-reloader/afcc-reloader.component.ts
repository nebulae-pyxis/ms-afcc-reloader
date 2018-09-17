import { AfccReloaderService } from './afcc-reloader.service';
import { Component, OnDestroy, OnInit, AfterViewInit } from '@angular/core';
import { fuseAnimations } from '../../../core/animations';
import { Subscription } from 'rxjs/Subscription';
import { ConnectionStatus } from './connection-status';
import { MatSnackBar, MatIconRegistry, MatDialog } from '@angular/material';
import { DomSanitizer } from '@angular/platform-browser';
import * as Rx from 'rxjs';
import { interval, of, forkJoin } from 'rxjs';
import {
  mergeMap,
  map,
  withLatestFrom,
  tap,
  mapTo,
  timeout,
  catchError,
  switchMap,
  filter,
  first,
  takeUntil,
  take
} from 'rxjs/operators';
import { startWith } from 'rxjs-compat/operator/startWith';
import { DeviceUiidResp } from './communication_profile/messages/response/device-uiid-resp';
import { AfccReloaderModelDialogComponent } from './afcc-reloader-modal-dialog/afcc-reloader-modal-dialog.component';
import { AuthReaderService } from './utils/auth-reader.service';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'afcc-reloader',
  templateUrl: './afcc-reloader.component.html',
  styleUrls: ['./afcc-reloader.component.scss'],
  animations: fuseAnimations
})
export class AfccReloaderComponent implements OnInit, OnDestroy {
  showLoaderSpinner = false;
  uiid$ = new Rx.Subject<any>();
  reloadButtonList;
  private subscribeList: Subscription[] = [];
  private readCardSubscription: Subscription;
  batteryLevel$ = new Rx.BehaviorSubject<any>({});
  deviceName$ = new Rx.BehaviorSubject<String>('Venta carga tarjetas');
  deviceConnectionStatus$ = new Rx.BehaviorSubject<String>('DISCONNECTED');

  constructor(
    private afccReloaderService: AfccReloaderService,
    private authReaderService: AuthReaderService,
    private snackBar: MatSnackBar,
    private iconRegistry: MatIconRegistry,
    private sanitizer: DomSanitizer,
    public dialog: MatDialog
  ) {
    this.iconRegistry.addSvgIcon(
      'battery-20',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/afcc-reloader/battery_20.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'battery-30',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/afcc-reloader/battery_30.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'battery-50',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/afcc-reloader/battery_50.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'battery-60',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/afcc-reloader/battery_60.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'battery-80',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/afcc-reloader/battery_80.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'battery-90',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/afcc-reloader/battery_90.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'battery-full',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/afcc-reloader/battery_full.svg'
      )
    );
    this.iconRegistry.addSvgIcon(
      'battery-unknown',
      this.sanitizer.bypassSecurityTrustResourceUrl(
        'assets/afcc-reloader/battery_unknown.svg'
      )
    );
  }

  ngOnInit() {
    this.afccReloaderService.deviceConnectionStatus$.subscribe(status => {
      if (status === ConnectionStatus.DISCONNECTED) {
        console.log('LLega desconexion');
        this.deviceName$.next('Venta carga tarjetas');
        this.afccReloaderService.onConnectionLost();
        this.openModalDialog();
      } else if (status === ConnectionStatus.IDLE) {
        this.openModalDialog();
      }
      this.deviceConnectionStatus$.next(status);
    });
    this.afccReloaderService.startNewConnection.subscribe(() =>
      this.newConnection()
    );
    /*
    setInterval(() => {
      console.log('Se ejecuta interval Uiid');
      if (!this.readCardSubscription) {
        console.log('Se ejecuta readCardSubscription');
        this.readCardSubscription = this.afccReloaderService.requestAfccCard$().subscribe(result => {
          this.uiid$.next(result);
        },
          error => {
            this.readCardSubscription = undefined;
          },
          () => {
            this.readCardSubscription = undefined;
          });
      }
     }, 2500);
     */
  }

  ngOnDestroy() {
    this.afccReloaderService.deviceConnectionStatus$.next(
      ConnectionStatus.DISCONNECTED
    );
    this.removeSubscriptions();
  }

  removeSubscriptions() {
    if (this.subscribeList) {
      this.subscribeList.forEach(sub => {
        sub.unsubscribe();
      });
    }
  }

  openModalDialog() {
    setTimeout(() => {
      this.dialog.open(AfccReloaderModelDialogComponent, {
        width: '300px',
        data: {}
      });
    }, 500);
  }

  newConnection() {
    this.afccReloaderService.deviceConnectionStatus$.next(
      ConnectionStatus.CONNECTING
    );
    this.afccReloaderService
      // Discover and connect to a device
      .stablishNewConnection$()
      .pipe(
        mergeMap(gattServer => {
          return forkJoin(
            // get the current battery lever of the connected device
            this.afccReloaderService.getBatteryLevel$().pipe(
              tap(batteryLevel => {
                this.batteryLevel$.next({
                  value: batteryLevel,
                  icon: this.batteryLevelToBatteryIcon(batteryLevel)
                });
              })
            ),
            // Start all bluetooth notifiers to the operation
            this.authReaderService.startNotifiersListener$()
          ).pipe(mapTo(gattServer));
        }),
        tap(server => {
          console.log(
            'Se conecta al disp: ',
            (server as BluetoothRemoteGATTServer).device.name
          );
          this.deviceName$.next(
            `Disp: ${(server as BluetoothRemoteGATTServer).device.name}`
          );
        }),
        // Start the auth process with the reader
        mergeMap(_ => this.authReaderService.startAuthReader$()),
        tap(() => console.log('Finaliza Auth con la lectora')),
        // if all the auth process finalize correctly, change the key and the current connection status
        switchMap(() => this.afccReloaderService.onConnectionSuccessful$()),
        tap(() => console.log('Finaliza proceso de conexion')),
        mergeMap(() =>
          // Start the a listener with the status of the reader
          this.afccReloaderService.listenDeviceConnectionChanges$()
        ),
        tap(() => console.log('Finaliza creación de escuchadores')),
        takeUntil(
          // end all the process if the connection with the device is lost
          this.afccReloaderService.getDevice$().pipe(
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
          this.afccReloaderService.disconnectDevice();
          return of(error);
        })
      )
      .subscribe(
        status => {
          this.afccReloaderService.deviceConnectionStatus$.next(
            status as String
          );
        },
        error => {
          console.log(error);
        },
        () => {
          console.log('Se completa OBS');
          this.afccReloaderService.deviceConnectionStatus$.next(
            ConnectionStatus.DISCONNECTED
          );
        }
      );
  }

  disconnectDevice() {
    this.afccReloaderService.disconnectDevice();
  }

  batteryLevelToBatteryIcon(value) {
    return !value
      ? 'battery-unknown'
      : value <= 20
        ? 'battery-20'
        : value > 20 && value <= 30
          ? 'battery-30'
          : value > 30 && value <= 50
            ? 'battery-50'
            : value > 50 && value <= 60
              ? 'battery-60'
              : value > 60 && value <= 80
                ? 'battery-80'
                : value > 80 && value <= 90
                  ? 'battery-90'
                  : 'battery-full';
  }

  afccReload(amount) {
    this.afccReloaderService.afccReload$(undefined, amount).subscribe(result => {
      console.log('llega resultado de transaccion: ', result);
    });
  }

  openSnackBar(text) {
    this.snackBar.open(text, 'Cerrar', { duration: 2000 });
  }
}

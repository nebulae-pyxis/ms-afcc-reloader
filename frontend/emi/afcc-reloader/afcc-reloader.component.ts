import { AfccReloaderService } from './afcc-reloader.service';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { fuseAnimations } from '../../../core/animations';
import { Subscription } from 'rxjs/Subscription';
import { ConnectionStatus } from './connection-status';
import { MatSnackBar, MatIconRegistry, MatDialog } from '@angular/material';
import { DomSanitizer } from '@angular/platform-browser';
import * as Rx from 'rxjs';
import { interval, of, forkJoin } from 'rxjs';
import {
  catchError,
} from 'rxjs/operators';
import { AfccReloaderModelDialogComponent } from './afcc-reloader-modal-dialog/afcc-reloader-modal-dialog.component';

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
  batteryLevel$ = new Rx.BehaviorSubject<any>({});
  deviceName$ = new Rx.BehaviorSubject<String>('Venta carga tarjetas');
  deviceConnectionStatus$ = new Rx.BehaviorSubject<String>('DISCONNECTED');
  uidIntervalId;
  uidSubject = new Rx.Subject<String>();
  private readCardSubscription: Subscription;

  constructor(
    private afccReloaderService: AfccReloaderService,
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
    // get the key reader to cypher and decypher the messages reader
    this.afccReloaderService.getKeyReaderAndConfigCypherData$().subscribe();
    // Listen changes on connection
    this.afccReloaderService.deviceConnectionStatus$.subscribe(status => {
      if (status === ConnectionStatus.DISCONNECTED) {
        console.log('LLega desconexion');
        this.deviceName$.next('Venta carga tarjetas');
        this.afccReloaderService.onConnectionLost();
        this.openModalDialog();
      } else if (status === ConnectionStatus.IDLE) {
        this.openModalDialog();
      }
      else if (status === ConnectionStatus.CONNECTED) {

      }
      this.deviceConnectionStatus$.next(status);
    });
    // Listen changes on batteryLevel
    this.afccReloaderService.batteryLevel$.subscribe(batteryLevel => {
      this.batteryLevel$.next({
        value: batteryLevel,
        icon: this.batteryLevelToBatteryIcon(batteryLevel)
      });
    });
    // Listen change on device name
    this.afccReloaderService.deviceName$.subscribe(name => {
      this.deviceName$.next(name);
    });
    // Listen the button of new connection located in the modal dialog
    this.afccReloaderService.startNewConnection.subscribe(() =>
      this.newConnection()
    );
    this.afccReloaderService.getAfccOperationConfig();

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
    if (!this.afccReloaderService.keyReader) {
      this.afccReloaderService.getKeyReaderAndConfigCypherData$().subscribe();
      this.openSnackBar('Fallo al establecer conexión, intentelo nuevamente');
      this.afccReloaderService.deviceConnectionStatus$.next(
        ConnectionStatus.DISCONNECTED
      );
    }
    else {
      this.afccReloaderService.stablishNewConnection$().pipe(
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
      ).subscribe(
        status => {
          this.afccReloaderService.deviceConnectionStatus$.next(status as String);
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
    this.afccReloaderService
      .afccReload$(undefined, amount)
      .subscribe(result => {
        console.log('llega resultado de transaccion: ', result);
      });
  }

  openSnackBar(text) {
    this.snackBar.open(text, 'Cerrar', { duration: 2000 });
  }


  readCard() {
    this.readCardSubscription = this.afccReloaderService.readCurrentCard$(this.uidSubject)
      .pipe(
    )
      .subscribe(result => {
        console.log('Resultado final: ', result);
        this.uiid$.next(result);
      },
        error => {
          console.log('error en POLLING ==========> ', error);
          this.readCardSubscription = undefined;
          // console.log('Error in auth: ', error);
          this.openSnackBar('Fallo al leer la tarjeta');
        },
        () => {
          console.log('Se completa obs');
          this.readCardSubscription = undefined;
        });
  }
}

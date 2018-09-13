import { AfccReloaderService } from './afcc-reloader.service';
import { Component, OnDestroy, OnInit, AfterViewInit } from '@angular/core';
import { fuseAnimations } from '../../../core/animations';
import { Subscription } from 'rxjs/Subscription';
import { ConnectionStatus } from './connection-status';
import { MatSnackBar, MatIconRegistry, MatDialog } from '@angular/material';
import { DomSanitizer } from '@angular/platform-browser';
import { Observer, Observable } from 'rxjs/Rx';
import { interval, of, forkJoin } from 'rxjs';
import { mergeMap, map, withLatestFrom, tap, mapTo, timeout, catchError } from 'rxjs/operators';
import { startWith } from 'rxjs-compat/operator/startWith';
import { DeviceUiidResp } from './communication_profile/messages/response/device-uiid-resp';
import { AfccReloaderModelDialogComponent } from './afcc-reloader-modal-dialog/afcc-reloader-modal-dialog.component';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'afcc-reloader',
  templateUrl: './afcc-reloader.component.html',
  styleUrls: ['./afcc-reloader.component.scss'],
  animations: fuseAnimations
})
export class AfccReloaderComponent implements OnInit, OnDestroy  {
  showLoaderSpinner = false;
  connectionStatus = 'DISCONNECTED';
  batteryLevel;
  batteryLevelIcon = 'battery-unknown';
  batteryLevelSub: Subscription;
  uiidSub: Subscription;
  afccTittle = '';
  uiid: any;
  reloadButtonList;

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
    this.afccReloaderService
      .deviceConnectionStatusListener$()
      .subscribe(status => {
        this.showLoaderSpinner = status === ConnectionStatus.CONNECTING;
        this.connectionStatus = status as string;
        if (this.connectionStatus === ConnectionStatus.CONNECTED) {
          this.batteryLevelSub = this.requestBatteryLevelByTime$()
            .map(result => {
              this.batteryLevel = result;
              return this.batteryLevelToBatteryIcon(result);
            })
            .subscribe(batteryLevelIcon => {
              this.batteryLevelIcon = batteryLevelIcon;
            });
          this.uiidSub = this.requestUiidByTime$().subscribe();
        } else if (this.connectionStatus === ConnectionStatus.DISCONNECTED) {
          this.openModalDialog();
          this.afccReloaderService.onConnectionLost();
          this.afccTittle = '';
          if (this.batteryLevelSub) {
            this.batteryLevel = 0;
            this.batteryLevelIcon = 'battery-unknown';
            this.batteryLevelSub.unsubscribe();
          }
          if (this.uiidSub) {
            this.uiid = '';
            this.uiidSub.unsubscribe();
          }
        }
        else if (this.connectionStatus === ConnectionStatus.IDLE) {
          this.openModalDialog();
        }
      });

    this.afccReloaderService.batteryLevelListener$().subscribe(batteryLevel => {
      this.batteryLevel = batteryLevel;
      this.batteryLevelIcon = this.batteryLevelToBatteryIcon(
        batteryLevel
      );
    });

    this.afccReloaderService.gattServerListener$().subscribe(gattServer => {
      this.afccTittle = `Disp: ${
        (gattServer as BluetoothRemoteGATTServer).device.name
      }`;
      this.openSnackBar(
        'Conexión establecida con el dispositivo: ' +
          (gattServer as BluetoothRemoteGATTServer).device.name
      );
    });
    this.reloadButtonList = [
      { cols: 1, rows: 1, buttonValue: 2000, color: 'lightblue' },
      { cols: 1, rows: 1, buttonValue: 5000, color: 'lightblue' },
      { cols: 1, rows: 1, buttonValue: 10000, color: 'lightblue' },
      { cols: 1, rows: 1, buttonValue: 15000, color: 'lightblue' },
      { cols: 1, rows: 1, buttonValue: 20000, color: 'lightblue' },
      { cols: 1, rows: 1, buttonValue: 30000, color: 'lightblue' },
      { cols: 1, rows: 1, buttonValue: 40000, color: 'lightblue' },
      { cols: 1, rows: 1, buttonValue: 50000, color: 'lightblue' },
      { cols: 1, rows: 1, buttonValue: 0, color: 'lightblue' }
    ];
  }

  ngOnDestroy() {
    this.batteryLevelSub.unsubscribe();
    this.afccReloaderService.changeDeviceConnectionStatus(
      ConnectionStatus.DISCONNECTED
    );
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
    this.afccReloaderService.changeDeviceConnectionStatus(
      ConnectionStatus.CONNECTING
    );
    this.afccReloaderService.disconnectDevice$().pipe(
      mergeMap(_ => this.afccReloaderService.stablishNewConnection$()),
      mergeMap(gattServer => {
        return this.afccReloaderService.getBatteryLevel$().pipe(
          tap(batteryLevel => {
            this.afccReloaderService.changeBatteryLevel(batteryLevel);
          }),
          mapTo(gattServer)
        );
      }),
      mergeMap(gattServer => {
        return this.afccReloaderService
          .startAuthReader$()
          .pipe(mapTo(gattServer));
      })
    )
      .subscribe(
        gattServer => {
          this.afccReloaderService.onConnectionSuccessful();
          this.afccReloaderService.changeGattServer(gattServer);
        },
        error => {
          console.log(error);
          this.afccReloaderService.changeDeviceConnectionStatus(
            ConnectionStatus.DISCONNECTED
          );
          if (error.toString().includes('Bluetooth adapter not available')) {
            this.openSnackBar('Bluetooth no soportado en este equipo');
          } else {
            this.openSnackBar(
              'Fallo al establecer conexión, intentelo nuevamente'
            );
          }
        },
        () => {}
      );
  }

  requestUiidByTime$() {
    return interval(2000).pipe(
      mergeMap(() => {
        return this.afccReloaderService.cardPowerOn$().
          pipe(
            mergeMap(resultPowerOn => {
              // aqui se puede tomar el ATR en el data
              return this.afccReloaderService.getUiid$();
            }),
            tap(resultUiid => {
              const resp = new DeviceUiidResp(resultUiid);
              this.uiid = this.afccReloaderService.authReaderService.cypherAesService.bytesTohex(resp.data.slice(0, -2));
            }),
            mergeMap(_ => this.afccReloaderService.cardPowerOff$())
          );
      }),
      catchError(error => of(`error requesting UIID`))
    );
  }

  requestBatteryLevelByTime$() {
    return interval(20000).pipe(
      mergeMap(() => {
        if (this.connectionStatus === ConnectionStatus.CONNECTED) {
          return this.afccReloaderService.getBatteryLevel$();
        }
        return of(undefined);
      })
    );
  }

  batteryLevelToBatteryIcon(result) {
    return !result
      ? 'battery-unknown'
      : result <= 20
        ? 'battery-20'
        : result > 20 && result <= 30
          ? 'battery-30'
          : result > 30 && result <= 50
            ? 'battery-50'
            : result > 50 && result <= 60
              ? 'battery-60'
              : result > 60 && result <= 80
                ? 'battery-80'
                : result > 80 && result <= 90
                  ? 'battery-90'
                  : 'battery-full';
  }

  openSnackBar(text) {
    this.snackBar.open(text, 'Cerrar', { duration: 2000 });
  }
}


import { AfccReloaderService } from './afcc-reloader.service';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { fuseAnimations } from '../../../core/animations';
import { Subscription } from 'rxjs/Subscription';
import { ConnectionStatus } from './connection-status';
import { MatSnackBar, MatIconRegistry } from '@angular/material';
import { DomSanitizer } from '@angular/platform-browser';
import { Observer, Observable } from 'rxjs/Rx';
import { interval, of, forkJoin } from 'rxjs';
import { mergeMap, map, withLatestFrom, tap, mapTo } from 'rxjs/operators';
import { startWith } from 'rxjs-compat/operator/startWith';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'afcc-reloader',
  templateUrl: './afcc-reloader.component.html',
  styleUrls: ['./afcc-reloader.component.scss'],
  animations: fuseAnimations
})
export class AfccReloaderComponent implements OnInit, OnDestroy {
  showLoaderSpinner = false;
  connectionStatus = 'DISCONNECTED';
  batteryLevel;
  batteryLevelIcon = 'battery-unknown';
  batteryLevelSub: Subscription;
  afccTittle = '';
  uiid: any;

  constructor(
    private afccReloaderService: AfccReloaderService,
    private snackBar: MatSnackBar,
    private iconRegistry: MatIconRegistry,
    private sanitizer: DomSanitizer
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
        } else if (this.connectionStatus === ConnectionStatus.DISCONNECTED){
          this.afccReloaderService.onConnectionLost();
          this.afccTittle = '';
          if (this.batteryLevelSub) {
            this.batteryLevel = 0;
            this.batteryLevelIcon = 'battery-unknown';
            this.batteryLevelSub.unsubscribe();
          }
        }
      });
  }
  ngOnDestroy() {
    this.batteryLevelSub.unsubscribe();
    this.afccReloaderService.changeDeviceConnectionStatus(ConnectionStatus.DISCONNECTED);
  }


  newConnection() {
    this.afccReloaderService.changeDeviceConnectionStatus(
      ConnectionStatus.CONNECTING
    );
      this.afccReloaderService.stablishNewConnection$().pipe(
        mergeMap(gattServer => {
          return this.afccReloaderService.getBatteryLevel$().pipe(
            tap(batteryLevel => {
              this.batteryLevel = batteryLevel;
              this.batteryLevelIcon = this.batteryLevelToBatteryIcon(
                batteryLevel
              );
            }),
            map(_ => gattServer)
          );
        })
      ).pipe(
      mergeMap(gattServer => {
      return this.afccReloaderService.startAuthReader$().pipe(
        mapTo(gattServer)
      );
      })
    ).subscribe(
      gattServer => {
        this.afccReloaderService.onConnectionSuccessful();
        this.afccTittle = `Disp: ${(gattServer as BluetoothRemoteGATTServer).device.name}`;
         this.openSnackBar(
          'Conexión establecida con el dispositivo: ' + (gattServer as BluetoothRemoteGATTServer).device.name
         );
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

  getUiid() {
    this.afccReloaderService.getUiid$().subscribe(result => {
      this.uiid = result;
    });
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

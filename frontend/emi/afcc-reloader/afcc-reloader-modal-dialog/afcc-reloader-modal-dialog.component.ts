import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material';
import { AfccReloaderService } from '../afcc-reloader.service';
import { ConnectionStatus } from '../connection-status';
import { mergeMap, tap, mapTo } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'app-afcc-reloader-modal-dialog.component',
  templateUrl: './afcc-reloader-modal-dialog.component.html',
  styleUrls: ['./afcc-reloader-modal-dialog.component.scss']
})
export class AfccReloaderModelDialogComponent implements OnInit {
  connectionStatus = 'DISCONNECTED';
  constructor(
    private dialogRef: MatDialogRef<AfccReloaderModelDialogComponent>,
    private afccReloaderService: AfccReloaderService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.afccReloaderService
      .deviceConnectionStatusListener$()
      .subscribe(status => {
        this.connectionStatus = status as string;
      });
  }

  newConnection() {
    this.dialogRef.close();
    this.afccReloaderService.changeDeviceConnectionStatus(
      ConnectionStatus.CONNECTING
    );
    this.afccReloaderService
      .disconnectDevice$()
      .pipe(
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

  openSnackBar(text) {
    this.snackBar.open(text, 'Cerrar', { duration: 2000 });
  }
}

import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material';
import { AfccReloaderService } from '../afcc-reloader.service';
import { ConnectionStatus } from '../connection-status';
import { mergeMap, tap, mapTo, first } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material';
import * as Rx from 'rxjs';

@Component({
  // tslint:disable-next-line:component-selector
  selector: 'app-afcc-reloader-modal-dialog.component',
  templateUrl: './afcc-reloader-modal-dialog.component.html',
  styleUrls: ['./afcc-reloader-modal-dialog.component.scss']
})
export class AfccReloaderModelDialogComponent implements OnInit {
  deviceConnectionStatus$ = new Rx.BehaviorSubject<String>('DISCONNECTED');
  private sub: Rx.Subscription;
  constructor(
    private dialogRef: MatDialogRef<AfccReloaderModelDialogComponent>,
    private afccReloaderService: AfccReloaderService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.sub = this.afccReloaderService
      .deviceConnectionStatus$
      .subscribe(status => {
        if (status === ConnectionStatus.CONNECTED) {
          this.dialogRef.close();
        }
        this.deviceConnectionStatus$.next(status);
      });
  }

  newConnection() {
    this.afccReloaderService.startNewConnection.next();
    this.afccReloaderService.deviceConnectionStatus$.next(
      ConnectionStatus.CONNECTING
    );
    this.dialogRef.close();
    this.sub.unsubscribe();
  }

  openSnackBar(text) {
    this.snackBar.open(text, 'Cerrar', { duration: 2000 });
  }
}

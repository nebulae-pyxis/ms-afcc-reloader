import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router/';
import { SharedModule } from '../../../core/modules/shared.module';
import { DatePipe } from '@angular/common';
import { FuseWidgetModule } from '../../../core/components/widget/widget.module';
import { AfccReloaderService } from './afcc-reloader.service';
import { MessageReaderTranslatorService } from './utils/message-reader-translator.service';
import { AfccReloaderComponent } from './afcc-reloader.component';
import { AngularBleModule } from '@nebulae/angular-ble';
import { AfccReloaderModelDialogComponent } from './afcc-reloader-modal-dialog/afcc-reloader-modal-dialog.component';

const routes: Routes = [
  {
    path: '',
    component: AfccReloaderComponent,
  }
];

@NgModule({
  imports: [
    SharedModule,
    AngularBleModule.forRoot({
      enableTracing: false
    }),
    RouterModule.forChild(routes),
    FuseWidgetModule
  ],
  declarations: [
    AfccReloaderComponent,
    AfccReloaderModelDialogComponent
  ],
  entryComponents: [
    AfccReloaderModelDialogComponent
  ],
  providers: [ AfccReloaderService, MessageReaderTranslatorService, DatePipe]
})

export class AfccReloaderModule {}

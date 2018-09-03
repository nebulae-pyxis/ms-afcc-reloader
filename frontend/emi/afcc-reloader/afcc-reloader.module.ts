import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router/';
import { SharedModule } from '../../../core/modules/shared.module';
import { DatePipe } from '@angular/common';
import { FuseWidgetModule } from '../../../core/components/widget/widget.module';
import { AfccReloaderService } from './afcc-reloader.service';
import { MessageReaderTranslatorService } from './utils/message-reader-translator.service';
import { AfccReloaderComponent } from './afcc-reloader.component';
import { AngularBleModule } from '@nebulae/angular-ble';

const routes: Routes = [
  {
    path: '',
    component: AfccReloaderComponent,
  }
];

@NgModule({
  imports: [
    SharedModule,
    AngularBleModule.forRoot(),
    RouterModule.forChild(routes),
    FuseWidgetModule
  ],
  declarations: [
    AfccReloaderComponent
  ],
  providers: [ AfccReloaderService, MessageReaderTranslatorService, DatePipe]
})

export class AfccReloaderModule {}

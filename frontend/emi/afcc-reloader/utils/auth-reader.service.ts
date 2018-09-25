import { Injectable } from '@angular/core';
import { Commons } from '../utils/commons';
import * as Rx from 'rxjs';
import { DataBlockRequest } from '../communication_profile/data-block-req';
import { CypherAesService, BluetoothService } from '@nebulae/angular-ble';
import { GattService } from './gatt-services';
import { map, mergeMap, tap } from 'rxjs/operators';
import { RdrToSphAuthRsp1 } from '../communication_profile/messages/response/rdr-to-sph-auth-resp1';
import { SphToRdrReqAuth } from '../communication_profile/messages/request/sph-to-rdr-req-auth';
import { MessageReaderTranslatorService } from './message-reader-translator.service';
import { MessageType } from '../communication_profile/message-type';
import { SphToRfrAuthResp } from '../communication_profile/messages/request/sph-to-rfr-auth-resp';
import { getMasterKeyReloader } from '../gql/AfccReloader';
import { GatewayService } from '../../../../api/gateway.service';

@Injectable()
export class AuthReaderService {
  rndA;
  rndB;

  constructor(
    private bluetoothService: BluetoothService,
    private messageReaderTranslator: MessageReaderTranslatorService,
    private gateway: GatewayService
  ) {}

}

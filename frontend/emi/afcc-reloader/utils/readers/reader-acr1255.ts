import { GattService } from '../gatt-services';
import { mergeMap, tap, mapTo, map } from 'rxjs/operators';
import * as Rx from 'rxjs';
import { MessageType } from '../../communication_profile/message-type';
import { DeviceConnectionStatus } from '../../communication_profile/messages/response/device-connection-status';
import { ConnectionStatus } from '../../connection-status';
import { SphToRdrReqAuth } from '../../communication_profile/messages/request/sph-to-rdr-req-auth';
import { Commons } from '../commons';
import { SphToRfrAuthResp } from '../../communication_profile/messages/request/sph-to-rfr-auth-resp';
import { RdrToSphAuthRsp1 } from '../../communication_profile/messages/response/rdr-to-sph-auth-resp1';
import { DataBlockRequest } from '../../communication_profile/data-block-req';

export class ReaderAcr1255 {
  // #region CONNECTION
  /**
   * Discover and connect from a bluetoothDevice
   * @param bluetoothService Service used to stablish connection
   * @returns a observable that have as result the gattServer of the device
   */
  stablishNewConnection$(
    bluetoothService,
    cypherAesService,
    batteryLevel$,
    deviceName$
  ) {
    return bluetoothService
      .connectDevice$({
        optionalServices: [GattService.NOTIFIER.SERVICE],
        filters: [{ namePrefix: 'ACR' }]
      })
      .pipe(
        mergeMap(gattServer => {
          return Rx.forkJoin(
            // get the current battery lever of the connected device
            this.getBatteryLevel$(bluetoothService).pipe(
              tap(batteryLevel => {
                batteryLevel$.next(batteryLevel);
              })
            ),
            // Start all bluetooth notifiers to the operation
            this.startNotifiersListener$(bluetoothService)
          ).pipe(mapTo(gattServer));
        }),
        tap(server => {
          deviceName$.next(
            `Disp: ${(server as BluetoothRemoteGATTServer).device.name}`
          );
        }),
         // Start the auth process with the reader
         mergeMap(_ => this.startAuthReader$(bluetoothService, cypherAesService)),
      );
  }

  /**
   * Start the bluetooth notifiers necesaries to use in all the operation
   * @param bluetoothService Service used to start the notifications
   */
  startNotifiersListener$(bluetoothService) {
    return bluetoothService.startNotifierListener$(
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.READER,
      {
        startByte: 0x05,
        stopByte: 0x0a,
        lengthPosition: { start: 1, end: 3, lengthPadding: 5 }
      }
    );
  }

  /**
   * Stop all bluetooth notifiers
   * @param bluetoothService Service used to stop the notifications
   */
  stopNotifiersListeners$(bluetoothService) {
    return bluetoothService.stopNotifierListener$(
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.READER
    );
  }

  /**
   * lestien the reader connection status
   */
  listenDeviceConnectionChanges$(bluetoothService, sessionKey) {
    return Rx.merge(
      bluetoothService.subscribeToNotifierListener(
        [{ position: 3, byteToMatch: MessageType.START_IDLE_STATUS },
          { position: 5, byteToMatch: 0x00 }],
        sessionKey
      ),
      bluetoothService.subscribeToNotifierListener(
        [{ position: 3, byteToMatch: MessageType.STOP_IDLE_STATUS },
          { position: 5, byteToMatch: 0x00 }],
        sessionKey
      )
    ).pipe(
      map(message => {

      const deviceConnectionStatusResp = new DeviceConnectionStatus(message);
      console.log('llega IDLE: ', deviceConnectionStatusResp.cmdMessageType);
        switch (deviceConnectionStatusResp.cmdMessageType) {
          // this case represents MessageType.START_IDLE_STATUS
          case '52':
            return ConnectionStatus.IDLE;
          // this case represents MessageType.STOP_IDLE_STATUS
          case '50':
            return ConnectionStatus.CONNECTED;
        }
      })
    );
  }
  // #endregion
  // #region AUTHENTICATION
  /**
   * send the first step to start the auth by the reader
   * @param bluetoothService
   */
  private sendAuthPhaseOne$(bluetoothService) {
    return bluetoothService.sendAndWaitResponse$(
      this.generateMessageRequestFormat(new SphToRdrReqAuth()),
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [
        { position: 3, byteToMatch: MessageType.ESCAPE_COMMAND_RESP },
        { position: 13, byteToMatch: 0x45 }
      ]
    );
  }

  /**
   * send the second step to the reader to generate the session key
   * @param authPhaseOneResp response of the first step
   */
  private sendAuthPhaseTwo$(
    authPhaseOneResp,
    cypherAesService,
    bluetoothService
  ) {
    const rndA = (cypherAesService.decrypt(authPhaseOneResp.data) as Uint8Array);
    const rndB = (window.crypto.getRandomValues(new Uint8Array(16)) as Uint8Array);
    const rndC = cypherAesService.decrypt(Commons.concatenate(rndB, rndA));
    const messageData = Commons.concatenate(
      new Uint8Array([0xe0, 0x00, 0x00, 0x46, 0x00]),
      rndC
    );
    return bluetoothService
      .sendAndWaitResponse$(
        this.generateMessageRequestFormat(new SphToRfrAuthResp(messageData)),
        GattService.NOTIFIER.SERVICE,
        GattService.NOTIFIER.WRITER,
        [
          { position: 3, byteToMatch: MessageType.ESCAPE_COMMAND_RESP },
          { position: 13, byteToMatch: 0x46 }
        ]
      )
      .pipe(
        mapTo(
          Array.from(Commons.concatenate(Array.from(rndA).slice(0, 8), Array.from(rndB).slice(0, 8)))
        )
      );
  }

  /**
   * Realice all the process to authenticate with the reader
   */
  startAuthReader$(bluetoothService, cypherAesService) {
    return this.sendAuthPhaseOne$(bluetoothService).pipe(
      map(authPhaseOneResp => new RdrToSphAuthRsp1(authPhaseOneResp)),
      mergeMap(authPhaseOneRespFormated => {
        return this.sendAuthPhaseTwo$(
          authPhaseOneRespFormated,
          cypherAesService,
          bluetoothService
        );
      })
    );
  }
  // #endregion
  // #region GENERAL UTILS
  /**
   * get the current device battery level
   * @param bluetoothService Service used to get the battery level
   */
  getBatteryLevel$(bluetoothService) {
    return bluetoothService.getBatteryLevel$();
  }

  /**
   * convert an object to a valid byte array for the reader
   * @param dataBlockRequest Object to convert
   * @param cypherAesService Cypher instace to encryp the message
   * @returns the byte array
   */
  generateMessageRequestFormat(
    dataBlockRequest: DataBlockRequest,
    cypherAesService?
  ) {
    let dataBlock;
    if (dataBlockRequest.isEncryptedMessage()) {
      dataBlock = cypherAesService.encrypt(dataBlockRequest.getDataBlock());
    } else {
      dataBlock = dataBlockRequest.getDataBlock();
    }
    dataBlockRequest.dataBlock = dataBlock;
    return Commons.concatenate(
      dataBlockRequest.startByte,
      dataBlockRequest.getDeviceMessageLenght(),
      dataBlock,
      dataBlockRequest.generateDeviceMessageXOR(),
      dataBlockRequest.stopByte
    );
  }

  // #endregion
}

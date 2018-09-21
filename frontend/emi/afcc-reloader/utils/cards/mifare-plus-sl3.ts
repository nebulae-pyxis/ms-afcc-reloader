import { CardPowerOn } from '../../communication_profile/messages/request/card-power-on';
import { GattService } from '../gatt-services';
import { MessageType } from '../../communication_profile/message-type';
import { CardPowerOff } from '../../communication_profile/messages/request/card-power-off';
import { DeviceUiidReq } from '../../communication_profile/messages/request/device-uiid-req';
import { filter, first, mergeMap, map, mapTo, tap } from 'rxjs/operators';
import { ConnectionStatus } from '../../connection-status';
import { ReaderAcr1255 } from '../readers/reader-acr1255';
import { CardPowerOnResp } from '../../communication_profile/messages/response/card-power-on-resp';
import { BluetoothService, CypherAesService } from '@nebulae/angular-ble';
import { AuthCardFirstStep } from '../../communication_profile/card-messages/request/auth-card-first-step';
import { AuthCardFirstStepResp } from '../../communication_profile/card-messages/response/auth-card-first-step-resp';
import { DeviceUiidResp } from '../../communication_profile/messages/response/device-uiid-resp';
import { getRndAAuthCard } from '../../gql/AfccReloader';
import { GatewayService } from '../../../../../api/gateway.service';
import { AuthCardSecondtStep } from '../../communication_profile/card-messages/request/auth-card-second-step';
import { of } from 'rxjs';

export class MyfarePlusSl3 {
  // #region CARD AUTHENTICATION
  /**
   * Send to the card the request of auth
   * @param bluetoothService
   * @param readerAcr1255
   * @param cypherAesService
   * @param sessionKey
   */
  cardAuthenticationFirstStep$(
    bluetoothService: BluetoothService,
    readerAcr1255: ReaderAcr1255,
    cypherAesService: CypherAesService,
    gateway: GatewayService,
    sessionKey
  ) {
    const cardAuthFirstStep = new AuthCardFirstStep(
      new Uint8Array([0x70, 0x05, 0x40, 0x00])
    );
    const message = readerAcr1255.generateMessageRequestFormat(
      cardAuthFirstStep,
      cypherAesService
    );
    return this.getUiid$(
      bluetoothService,
      readerAcr1255,
      cypherAesService,
      sessionKey
    )
      .pipe(
        map(resultUid => {
          const resp = new DeviceUiidResp(resultUid);
          // get the last 4 bytes of the uid and remove the las 2 bytes
          // of the data(this bytes is onle to verify if is a correct answer)
          const uid = cypherAesService.bytesTohex(resp.data.slice(-6, -2));
          console.log(`UID Tarjeta: ${uid}`);
          return uid;
        }),
        mergeMap(uid => {
          return bluetoothService
            .sendAndWaitResponse$(
              message,
              GattService.NOTIFIER.SERVICE,
              GattService.NOTIFIER.WRITER,
              [{ position: 3, byteToMatch: MessageType.APDU_COMMAND_RESP }],
              sessionKey
            )
            .pipe(
              map(result => {
                const authCardFirstStepResp = new AuthCardFirstStepResp(result);
                // if the first byte of the data is different to  0x90 that means is an error
                if (authCardFirstStepResp.data[0] !== 0x90) {
                  throw new Error('failed in the authentication');
                }
                console.log(
                  'Llega respuesta de incio de auth: ',
                  cypherAesService.bytesTohex(authCardFirstStepResp.data)
                );
                // is removed the first byte of the date to just use the rndA
                return Array.from(authCardFirstStepResp.data).slice(1);
              }),
            map(rndA => {
              return { rndA, uid };
            })
            );
        }),
      mergeMap(result => {
          console.log('Se envia RNDA AL SERVIDOR =====> ', cypherAesService.bytesTohex((result as any).rndA));
          return gateway.apollo
            .query<any>({
              query: getRndAAuthCard,
              variables: {
                uid: (result as any).uid,
                postId: '12345',
                data: cypherAesService.bytesTohex((result as any).rndA)
              },
              errorPolicy: 'all'
            })
            .pipe(
              map(response => {
                return response.data.getRndAAuthCard;
              })
            );
        })
      );
  }

  /**
   * Send to the card the request of auth
   * @param bluetoothService
   * @param readerAcr1255
   * @param cypherAesService
   * @param sessionKey
   */
  cardAuthenticationSecondStep$(
    bluetoothService: BluetoothService,
    readerAcr1255: ReaderAcr1255,
    cypherAesService: CypherAesService,
    gateway: GatewayService,
    sessionKey,
    cardAuthenticationFirstStepResp
  ) {
    return of(cardAuthenticationFirstStepResp).pipe(
      map(firstStepResp => {
        const firstStepRespFormated = JSON.parse(JSON.stringify(firstStepResp));
        console.log(
          'llega llave del servidor =====> ',
          firstStepRespFormated.data
        );
        if (!firstStepRespFormated.data) {
          throw new Error('rndA card auth not found');
        }
        // console.log('Primer paso formateado: ', firstStepRespFormated);
        const rndA = Array.from(cypherAesService.hexToBytes(
          firstStepRespFormated.data
        ) as Uint8Array);
        if (rndA[-2] === 0x90) {
          throw new Error('Authentication with the card failed');
        }
        firstStepRespFormated.data = rndA;
        return firstStepRespFormated;
      }),
      mergeMap(respFormated => {
        console.log(
          'Se toma llave unica del mensaje ',
          cypherAesService.bytesTohex(respFormated.data.slice(0, -2))
        );
        const cardAuthSecondStep = new AuthCardSecondtStep(
          new Uint8Array([0x72].concat(respFormated.data.slice(0, -2)))
        );
        console.log(
          'Se envia paso dos a la lectora: ',
          cypherAesService.bytesTohex(cardAuthSecondStep.data)
        );
        const message = readerAcr1255.generateMessageRequestFormat(
          cardAuthSecondStep,
          cypherAesService
        );
        return bluetoothService.sendAndWaitResponse$(
          message,
          GattService.NOTIFIER.SERVICE,
          GattService.NOTIFIER.WRITER,
          [{ position: 3, byteToMatch: MessageType.APDU_COMMAND_RESP }],
          sessionKey
        );
      })
    );
  }

  /**
   * send a card power on to start the read action, then send the request of auth, then close the
   * read action using a card power off
   * @param bluetoothService
   * @param sessionKey
   * @param cypherAesService
   * @param deviceConnectionStatus$
   */
  authWithCard$(
    bluetoothService,
    readerAcr1255,
    sessionKey,
    cypherAesService,
    deviceConnectionStatus$,
    gateway: GatewayService
  ) {
    return deviceConnectionStatus$.pipe(
      filter(
        connectionStatus => connectionStatus === ConnectionStatus.CONNECTED
      ),
      first(),
      mergeMap(() => {
        // start the read process in the reader
        return this.cardPowerOn$(
          bluetoothService,
          readerAcr1255,
          cypherAesService,
          sessionKey
        ).pipe(
          mergeMap(resultPowerOn => {
            const resp = new CardPowerOnResp(resultPowerOn);
            if (resp.data.length > 0 && resp.data[4] !== 0xc1) {
              throw new Error('invalid card');
            }
            return this.cardAuthenticationFirstStep$(
              bluetoothService,
              readerAcr1255,
              cypherAesService,
              gateway,
              sessionKey
            );
          }),
          mergeMap(cardAuthenticationFirstStepResp =>
            this.cardAuthenticationSecondStep$(
              bluetoothService,
              readerAcr1255,
              cypherAesService,
              gateway,
              sessionKey,
              cardAuthenticationFirstStepResp
            )
          ),
          tap(resp =>
            console.log(
              'LLEGA de la lectora: ',
              cypherAesService.bytesTohex(resp)
            )
          ),
          mergeMap(uiid => {
            return this.cardPowerOff$(
              bluetoothService,
              readerAcr1255,
              cypherAesService,
              sessionKey
            ).pipe(mapTo(uiid));
          })
        );
      })
    );
  }
  // #endregion

  // #region READ CARD
  /**
   * start the read process in the reader
   */
  cardPowerOn$(
    bluetoothService,
    readerAcr1255: ReaderAcr1255,
    cypherAesService,
    sessionKey
  ) {
    const cardPoweOnReq = new CardPowerOn(new Uint8Array(0));
    const message = readerAcr1255.generateMessageRequestFormat(
      cardPoweOnReq,
      cypherAesService
    );
    return bluetoothService.sendAndWaitResponse$(
      message,
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.CARD_POWER_ON_RESP }],
      sessionKey
    );
  }

  /**
   * close the read process in the reader
   */
  cardPowerOff$(bluetoothService, readerAcr1255, cypherAesService, sessionKey) {
    const cardPoweOffReq = new CardPowerOff(new Uint8Array(0));
    const message = readerAcr1255.generateMessageRequestFormat(
      cardPoweOffReq,
      cypherAesService
    );
    return bluetoothService.sendAndWaitResponse$(
      message,
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.CARD_POWER_OFF_RESP }],
      sessionKey
    );
  }

  /**
   * get the uiid of the current card
   */
  getUiid$(bluetoothService, readerAcr1255, cypherAesService, sessionKey) {
    const uiidReq = new DeviceUiidReq(
      new Uint8Array([0xff, 0xca, 0x00, 0x00, 0x00])
    );
    const message = readerAcr1255.generateMessageRequestFormat(
      uiidReq,
      cypherAesService
    );
    return bluetoothService.sendAndWaitResponse$(
      message,
      GattService.NOTIFIER.SERVICE,
      GattService.NOTIFIER.WRITER,
      [{ position: 3, byteToMatch: MessageType.APDU_COMMAND_RESP }],
      sessionKey
    );
  }
  // #endregion
}

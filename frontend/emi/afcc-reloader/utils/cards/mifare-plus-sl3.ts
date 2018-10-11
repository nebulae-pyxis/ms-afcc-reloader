import { CardPowerOn } from '../../communication_profile/messages/request/card-power-on';
import { GattService } from '../gatt-services';
import { MessageType } from '../../communication_profile/message-type';
import { CardPowerOff } from '../../communication_profile/messages/request/card-power-off';
import { DeviceUiidReq } from '../../communication_profile/messages/request/device-uiid-req';
import {
  filter,
  first,
  mergeMap,
  map,
  mapTo,
  tap,
  reduce,
  concatMap,
  take,
  delay,
  toArray
} from 'rxjs/operators';
import { ConnectionStatus } from '../../connection-status';
import { ReaderAcr1255 } from '../readers/reader-acr1255';
import { CardPowerOnResp } from '../../communication_profile/messages/response/card-power-on-resp';
import { BluetoothService } from '@nebulae/angular-ble';
import { AuthCardFirstStep } from '../../communication_profile/card-messages/request/auth-card-first-step';
import { AuthCardFirstStepResp } from '../../communication_profile/card-messages/response/auth-card-first-step-resp';
import { DeviceUiidResp } from '../../communication_profile/messages/response/device-uiid-resp';
import { getRndAAuthCard, getAuthConfirmation } from '../../gql/AfccReloader';
import { GatewayService } from '../../../../../api/gateway.service';
import { AuthCardSecondtStep } from '../../communication_profile/card-messages/request/auth-card-second-step';
import { of, from, Observable, range } from 'rxjs';
import { AuthCardSecondStepResp } from '../../communication_profile/card-messages/response/auth-card-second-step';
import { CypherAes } from '../cypher-aes';
import { ReadEncBlock } from '../../communication_profile/card-messages/request/read-enc-block';
import { ReadEncBlockResp } from '../../communication_profile/card-messages/response/read-enc-block-resp';
import { Commons } from '../commons';

export class MyfarePlusSl3 {
  cardReadMapping = [
    {
      blocks: [10, 12, 13, 14],
      blockValues: [8, 9]
    }
  ];

  readCurrentCard$(
    bluetoothService,
    readerAcr1255,
    sessionKey,
    cypherAesService,
    deviceConnectionStatus$,
    gateway,
    currentSamId$,
    afccOperationConfig,
    uidSubject
  ) {
    // get the key to use in auth card action
    return this.cardPowerOn$(
      bluetoothService,
      readerAcr1255,
      cypherAesService,
      sessionKey
    ).pip(
      mergeMap(res => {
      return this.getUid$(
        bluetoothService,
        readerAcr1255,
        cypherAesService,
        sessionKey
      ).pipe(
        map(resultUid => {
          const resp = new DeviceUiidResp(resultUid);
          // get the last 4 bytes of the uid and remove the las 2 bytes
          // of the data(this bytes is onle to verify if is a correct answer)
          const uid = cypherAesService.bytesTohex(resp.data.slice(-6, -2));
          console.log(`UID Tarjeta: ${uid}`);
          uidSubject.next(uid);
          return uid;
        }));
      }),
      mergeMap(() => {
        return this.cardPowerOff$(
          bluetoothService,
          readerAcr1255,
          cypherAesService,
          sessionKey
        ).pipe(mapTo('Disconnecte from the card'));
      })
    );
    // THIS IS THE REAL SECTION REMOVE THE ABDOVE SECTION AND UNCOMMENT THIS
    // from(afccOperationConfig.readFlow).pipe(
    //   filter(readFlowToFilter => (readFlowToFilter as any).key === 'readDebit'),
    //   first(),
    //   mergeMap(readFlow => {
    //     return this.readCardSection$(
    //       bluetoothService,
    //       readerAcr1255,
    //       sessionKey,
    //       cypherAesService,
    //       deviceConnectionStatus$,
    //       gateway,
    //       currentSamId$,
    //       readFlow,
    //       afccOperationConfig,
    //       uidSubject
    //     );
    //   })
    // );
  }

  readCardSection$(
    bluetoothService,
    readerAcr1255,
    sessionKey,
    cypherAesService,
    deviceConnectionStatus$,
    gateway,
    currentSamId$,
    readFlow,
    afccOperationConfig,
    uidSubject
  ) {
    return Observable.create(async observer => {
      const readCardResult = { authObj: {}, rawData: [], blockList: []};
      for (let i = 0; i < readFlow.instructionSet.length; i++) {
        const instructionSet = readFlow.instructionSet[i];
        const method = instructionSet.split('-')[0];
        const param = instructionSet.split('-').slice(1);
        switch (method) {
          case 'A':
            readCardResult.authObj = await from(afccOperationConfig.keys)
              .pipe(
                filter(authKeyObj => (authKeyObj as any).key === param[0]),
                take(1),
                mergeMap(authKeyObj => {
                  return this.authWithCard$(
                    bluetoothService,
                    readerAcr1255,
                    sessionKey,
                    cypherAesService,
                    deviceConnectionStatus$,
                    gateway,
                    currentSamId$,
                    (authKeyObj as any).value,
                    uidSubject
                  );
                }),
                map(dataInfo =>
                  Array.from(
                    cypherAesService.hexToBytes((dataInfo as any).data)
                  )
                ),
                map(resultByte => {
                  return {
                    keyEnc: (resultByte as any).slice(0, 16),
                    keyMac: (resultByte as any).slice(16, 32),
                    ti: (resultByte as any).slice(32, 36),
                    readCounter: 0,
                    writeCounter: 0
                  };
                }),
                first()
              )
              .toPromise();
            break;
          case 'R':
            const result = await this.readBlockEncrypted$(
              param[0],
              param[1],
              readCardResult.authObj,
              bluetoothService,
              sessionKey,
              cypherAesService,
              readerAcr1255
            )
              .pipe(
                tap(blockData => console.log('llega blockData: ', blockData))
              )
              .toPromise();
            readCardResult.rawData.push({
              // tslint:disable-next-line:radix
              initBlock: parseInt(param[0]),
              // tslint:disable-next-line:radix
              count: parseInt(param[1]),
              data: Array.from(result.data)
            });
            break;
        }
      }
      observer.next(readCardResult);
      observer.complete();
    }).pipe(
      mergeMap(readCardResult => {
      return from((readCardResult as any).rawData).pipe(
        mergeMap(rawData => {
          return range(1, (rawData as any).count).pipe(
            map(index => {
              const endIndex = (16 * index) - 1;
              let initIndex = endIndex - 16;
              if (initIndex < 0) {
                initIndex = 0;
              }
              console.log('Init Index ', initIndex);
              console.log('End Index ', endIndex);
              const data = (rawData as any).data.slice(initIndex, endIndex);
              console.log('Data wraper: ', data);
              return { block: ((rawData as any).initBlock + (index - 1)), data };
            })
          );
        }),
        toArray(),
        tap(finalResult => console.log(finalResult))
        );
      }),
      mergeMap(resp => {
        return this.cardPowerOff$(
          bluetoothService,
          readerAcr1255,
          cypherAesService,
          sessionKey
        ).pipe(mapTo('Disconnecte from the card'));
      })
    );
    /*from(afccOperationConfig.keys).pipe(
      filter(keyObj  => (keyObj as any).key === 'DEBIT'),
      first(),
      */
  }

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
    cypherAesService: CypherAes,
    gateway: GatewayService,
    sessionKey,
    authKey,
    uidSubject
  ) {
    const authKeyByte = cypherAesService.hexToBytes(authKey);
    // prepare the auth message to send to card
    const cardAuthFirstStep = new AuthCardFirstStep(
      Commons.concatenate(
        new Uint8Array([0x70]),
        authKeyByte,
        new Uint8Array([0x00])
      )
    );
    const message = readerAcr1255.generateMessageRequestFormat(
      cardAuthFirstStep,
      cypherAesService
    );
    // get the uid of the card (used in the authentication)
    return this.getUid$(
      bluetoothService,
      readerAcr1255,
      cypherAesService,
      sessionKey
    ).pipe(
      map(resultUid => {
        const resp = new DeviceUiidResp(resultUid);
        // get the last 4 bytes of the uid and remove the las 2 bytes
        // of the data(this bytes is onle to verify if is a correct answer)
        const uid = cypherAesService.bytesTohex(resp.data.slice(-6, -2));
        console.log(`UID Tarjeta: ${uid}`);

        return uid;
      }),
      mergeMap(uid => {
        // after succesful getted the card uiid start the first step of auth in the card
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
              // return the random bytes generated by the card an the uid of the card (both used to generate the second step of auth)
              return { rndA, uid };
            })
          );
      }),
      mergeMap(result => {
        console.log(
          'Se envia RNDA AL SERVIDOR =====> ',
          cypherAesService.bytesTohex((result as any).rndA)
        );
        return gateway.apollo
          .query<any>({
            query: getRndAAuthCard,
            variables: {
              uid: (result as any).uid,
              postId: '12345',
              data: cypherAesService.bytesTohex((result as any).rndA),
              key: 2
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
    cypherAesService: CypherAes,
    gateway: GatewayService,
    sessionKey,
    cardAuthenticationFirstStepResp,
    currentSamId$
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
        currentSamId$.next(firstStepRespFormated.samid);
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
    gateway: GatewayService,
    currentSamId$,
    authKey,
    uidSubject
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
            // after the reader as been ready to receive info from card, send a auth request to the card
            return this.cardAuthenticationFirstStep$(
              bluetoothService,
              readerAcr1255,
              cypherAesService,
              gateway,
              sessionKey,
              authKey,
              uidSubject
            );
          }),
          mergeMap(cardAuthenticationFirstStepResp =>
            this.cardAuthenticationSecondStep$(
              bluetoothService,
              readerAcr1255,
              cypherAesService,
              gateway,
              sessionKey,
              cardAuthenticationFirstStepResp,
              currentSamId$
            )
          ),
          tap(resp =>
            console.log(
              'LLEGA de la lectora: ',
              cypherAesService.bytesTohex(resp)
            )
          ),
          map(unwrapetResp => new AuthCardSecondStepResp(unwrapetResp)),
          tap(printTest =>
            console.log('Se convierte a objeto el paso 2: ', printTest)
          ),
          mergeMap(phaseTwoResp => {
            return currentSamId$.pipe(
              mergeMap(samId => {
                console.log('se consulta con samId: ', samId);
                console.log(
                  'Se envia el data: ',
                  cypherAesService.bytesTohex(
                    Array.from((phaseTwoResp as any).data).slice(1)
                  )
                );
                // tslint:disable-next-line:radix
                const samHex = parseInt(samId as string).toString(16);
                return gateway.apollo
                  .query<any>({
                    query: getAuthConfirmation,
                    variables: {
                      samId: samHex,
                      postId: '12345',
                      data: cypherAesService.bytesTohex(
                        Array.from((phaseTwoResp as any).data).slice(1)
                      )
                    },
                    errorPolicy: 'all'
                  })
                  .pipe(
                    map(response => {
                      return response.data.getAuthConfirmation;
                    })
                  );
              })
            );
          }),
          tap(serverResp => {
            console.log(
              'LLEGA CONFIRMACION DE LA GRANJA DE SAM =====> ',
              serverResp
            );
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
  private getUid$(
    bluetoothService,
    readerAcr1255,
    cypherAesService,
    sessionKey
  ) {
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
  // #region GENERAL TOOLS
  private readBlockEncrypted$(
    bNr,
    extm,
    cardAuthObj,
    bluetoothService,
    sessionKey,
    cypherAesService: CypherAes,
    readerAcr1255
  ) {
    return of(new ReadEncBlock(bNr, extm, cardAuthObj, cypherAesService)).pipe(
      mergeMap(readEncBlock => {
        const message = readerAcr1255.generateMessageRequestFormat(
          readEncBlock,
          cypherAesService
        );
        return bluetoothService.sendAndWaitResponse$(
          message,
          GattService.NOTIFIER.SERVICE,
          GattService.NOTIFIER.WRITER,
          [{ position: 3, byteToMatch: MessageType.APDU_COMMAND_RESP }],
          sessionKey
        );
      }),
      map(
        resp =>
          new ReadEncBlockResp(resp, bNr, extm, cardAuthObj, cypherAesService)
      )
    );
  }

  private readBlockPlainMac$(
    bNr,
    extm,
    cardAuthObj,
    bluetoothService,
    sessionKey,
    cypherAesService: CypherAes,
    readerAcr1255
  ) {
    return of(new ReadEncBlock(bNr, extm, cardAuthObj, cypherAesService)).pipe(
      mergeMap(readEncBlock => {
        const message = readerAcr1255.generateMessageRequestFormat(
          readEncBlock,
          cypherAesService
        );
        return bluetoothService.sendAndWaitResponse$(
          message,
          GattService.NOTIFIER.SERVICE,
          GattService.NOTIFIER.WRITER,
          [{ position: 3, byteToMatch: MessageType.APDU_COMMAND_RESP }],
          sessionKey
        );
      }),
      map(
        resp =>
          new ReadEncBlockResp(resp, bNr, extm, cardAuthObj, cypherAesService)
      )
    );
  }

  // #endregion
}

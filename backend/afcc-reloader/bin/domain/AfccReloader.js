'use strict';

const Rx = require('rxjs');
const eventSourcing = require('../tools/EventSourcing')();
const AfccReloadValidationHelper = require('./AfccReloadValidationHelper')
const { CustomError, DefaultError } = require("../tools/customError");
const Event = require("@nebulae/event-store").Event;

let instance;

class AfccReloader {
  constructor() {}

  reloadAfcc$({ root, args, jwt }, authToken) {
    const afccReload = args.input;
    return AfccReloadValidationHelper.validateAfccReload$(args.input, authToken)
      .mergeMap(() => { 
        return eventSourcing.eventStore.emitEvent$(      
          new Event({
            amount: afccReload.amount,
            businessId:  authToken.businessId,
            afcc: {
              data: {
                //TODO: change to real data
                before: {},
                //TODO: change to real data
                after: {}
              },
              uId: afccReload.cardUiid,
              cardId: afccReload.id,
              balance: {
                //TODO: change to real data
                before: 1000,
                //TODO: change to real data
                after: 2000
              }
            },
            source: {
              //TODO: change to real data
              machine: "Nesas-12",
              //TODO: change to real data
              ip: "192.168.1.15"
            }
            
          }
          )
        )
      })
      .map(() => { 
        return { code: 200, message: `Afccc with id: ${afccReload.id } has been reloaded with a value: ${afccReload.amount}`}
      })
      .mergeMap(rawResponse => this.buildSuccessResponse$(rawResponse))
      .catch(error => this.handleError$(error));
  }

  getMasterKeyReloader$({ root, args, jwt }, authToken) { 
    return AfccReloadValidationHelper.checkRole$(authToken, 'getMasterKeyReloader$')
      .map(() => { 
        console.log('process.env.AFCC_MASTER_KEY_READER: ', process.env.AFCC_MASTER_KEY_READER);
        return {code: 200, key: JSON.parse("["+(process.env.AFCC_MASTER_KEY_READER) +"]")}
      })
      .mergeMap(rawResponse => this.buildSuccessResponse$(rawResponse))
      .catch(error => this.handleError$(error));;
    
  }

  handleError$(err) {
    return Rx.Observable.of(err).map(err => {
      const exception = { data: null, result: {} };
      const isCustomError = err instanceof CustomError;
      if (!isCustomError) {
        err = new DefaultError(err);
      }
      exception.result = {
        code: err.code,
        error: { ...err.getContent() }
      };
      return exception;
    });
  }

  buildSuccessResponse$(rawRespponse) {
    return Rx.Observable.of(rawRespponse).map(resp => {
      return {
        data: resp,
        result: {
          code: 200
        }
      };
    });
  }
}

module.exports = () => {
  if (!instance) {
    instance = new AfccReloader();
    console.log('Cronjobs Singleton created');
  }
  return instance;
};


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
            eventType: 'AfccReloadSold',
            eventTypeVersion: 1,
            aggregateType: 'Afcc',
            aggregateId: afccReload.id,
            data: afccReload,
            //TODO: aca se debe colocar el usuario que periste el evento
            user: 'SYSTEM.AfccReload.afcc'
          })
        )
      })
      .map(() => { 
        return { code: 200, message: `Afccc with id: ${afccReload.id } has been reloaded with a value: ${afccReload.amount}`}
      })
      .mergeMap(rawResponse => this.buildSuccessResponse$(rawResponse))
      .catch(error => this.handleError$(error));
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

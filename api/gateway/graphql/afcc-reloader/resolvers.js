const withFilter = require('graphql-subscriptions').withFilter;
const PubSub = require('graphql-subscriptions').PubSub;
const pubsub = new PubSub();
const Rx = require('rxjs');
const RoleValidator = require('../../tools/RoleValidator');
const broker = require('../../broker/BrokerFactory')();
const { CustomError } = require('../../tools/customError');
const superagent = require('superagent');

const INTERNAL_SERVER_ERROR_CODE = 18001;
const USERS_PERMISSION_DENIED_ERROR_CODE = 18002;

/**
 * Handles errors
 * @param {*} err
 * @param {*} operationName
 */
function handleError$(err, methodName) {
  return Rx.Observable.of(err).map(err => {
    const exception = { data: null, result: {} };
    const isCustomError = err instanceof CustomError;
    if (!isCustomError) {
      err = new CustomError(
        err.name,
        methodName,
        INTERNAL_SERVER_ERROR_CODE,
        err.message
      );
    }
    exception.result = {
      code: err.code,
      error: { ...err.getContent() }
    };
    return exception;
  });
}

function getResponseFromBackEnd$(response) {
  console.log('llega respuesta ========> ', response);
  return Rx.Observable.of(response).map(resp => {
    if (resp.result.code != 200) {
      const err = new Error();
      err.name = 'Error';
      err.message = resp.result.error;
      // this[Symbol()] = resp.result.error;
      Error.captureStackTrace(err, 'Error');
      throw err;
    }
    return resp.data;
  });
}

module.exports = {
  //// QUERY ///////
  Query: {
    getAfccOperationConfig(root, args, context) {
      return RoleValidator.checkPermissions$(
        context.authToken.realm_access.roles,
        'Afcc',
        'getMasterKeyReloader',
        USERS_PERMISSION_DENIED_ERROR_CODE,
        'Permission denied',
        ['pos']
      )
        .mergeMap(() => { 
          console.log('llega al api');
          return context.broker.forwardAndGetReply$(
            'Afcc',
            'gateway.graphql.query.getAfccOperationConfig',
            { root, args, jwt: context.encodedToken },
            2000
          )
        }
        )
        .catch(err => handleError$(err, 'getAfccOperationConfig'))
        .mergeMap(response => getResponseFromBackEnd$(response))
        .toPromise();
    },
    getMasterKeyReloader(root, args, context) {
      return RoleValidator.checkPermissions$(
        context.authToken.realm_access.roles,
        'Afcc',
        'getMasterKeyReloader',
        USERS_PERMISSION_DENIED_ERROR_CODE,
        'Permission denied',
        ['pos']
      )
        .mergeMap(() =>
          context.broker.forwardAndGetReply$(
            'Afcc',
            'gateway.graphql.query.getMasterKeyReloader',
            { root, args, jwt: context.encodedToken },
            2000
          )
        )
        .catch(err => handleError$(err, 'getMasterKeyReloader'))
        .mergeMap(response => getResponseFromBackEnd$(response))
        .toPromise();
    },

    getRndAAuthCard(root, args, context) {
      return RoleValidator.checkPermissions$(
        context.authToken.realm_access.roles,
        'Afcc',
        'getRndAAuthCard',
        USERS_PERMISSION_DENIED_ERROR_CODE,
        'Permission denied',
        ['pos']
      )
        .mergeMap(() => { 
          console.log('key: ', args.key);
          return Rx.Observable.defer(() => {
            return superagent
              .get(`${process.env.SAM_HTPP_END_POINT}/firstauthf1/${args.uid}`)
              .query({ postid: args.postId, data: args.data, key: args.key });
          });
        })
        .map(result => JSON.parse(result.res.text))
        .map(dataInfo => { 
          dataInfo.timestamp = parseInt(dataInfo.timestamp / 1000000);
          return dataInfo;
        })
        .catch(err => handleError$(err, 'getRndAAuthCard'))
        .toPromise();
    },

    getAuthConfirmation(root, args, context) {
      return RoleValidator.checkPermissions$(
        context.authToken.realm_access.roles,
        'Afcc',
        'getAuthConfirmation',
        USERS_PERMISSION_DENIED_ERROR_CODE,
        'Permission denied',
        ['pos']
      )
        .mergeMap(() => { 
          console.log('Se consulta con el samid: ', args.samId);
          console.log('URL =====> ',`${process.env.SAM_HTPP_END_POINT}/firstauthf2/${args.samId}?postid=${args.postId}&data=${args.data}`)
          return Rx.Observable.defer(() => {
            return superagent
              .get(`${process.env.SAM_HTPP_END_POINT}/firstauthf2/${args.samId}`)
              .query({ postid: args.postId, data: args.data });
          });
        })
        .map(result => JSON.parse(result.res.text))
        .map(dataInfo => { 
          dataInfo.timestamp = parseInt(dataInfo.timestamp / 1000000);
          return dataInfo;
        })
        .catch(err => handleError$(err, 'getAuthConfirmation'))
        .toPromise();
    }
  },
  //// MUTATIONS ///////

  Mutation: {
    reloadAfcc(root, args, context) {
      return RoleValidator.checkPermissions$(
        context.authToken.realm_access.roles,
        'Afcc',
        'reloadAfcc',
        USERS_PERMISSION_DENIED_ERROR_CODE,
        'Permission denied',
        ['pos']
      )
        .mergeMap(() =>
          context.broker.forwardAndGetReply$(
            'Afcc',
            'gateway.graphql.mutation.reloadAfcc',
            { root, args, jwt: context.encodedToken },
            2000
          )
        )
        .catch(err => handleError$(err, 'reloadAfcc'))
        .mergeMap(response => getResponseFromBackEnd$(response))
        .toPromise();
    }
  }

  //// SUBSCRIPTIONS ///////
};

//// SUBSCRIPTIONS SOURCES ////

const eventDescriptors = [
  {
    backendEventName: 'AfccReloaderHelloWorldEvent',
    gqlSubscriptionName: 'AfccReloaderHelloWorldSubscription',
    dataExtractor: evt => evt.data, // OPTIONAL, only use if needed
    onError: (error, descriptor) =>
      console.log(`Error processing ${descriptor.backendEventName}`), // OPTIONAL, only use if needed
    onEvent: (evt, descriptor) =>
      console.log(`Event of type  ${descriptor.backendEventName} arraived`) // OPTIONAL, only use if needed
  }
];

/**
 * Connects every backend event to the right GQL subscription
 */
eventDescriptors.forEach(descriptor => {
  broker.getMaterializedViewsUpdates$([descriptor.backendEventName]).subscribe(
    evt => {
      if (descriptor.onEvent) {
        descriptor.onEvent(evt, descriptor);
      }
      const payload = {};
      payload[descriptor.gqlSubscriptionName] = descriptor.dataExtractor
        ? descriptor.dataExtractor(evt)
        : evt.data;
      pubsub.publish(descriptor.gqlSubscriptionName, payload);
    },

    error => {
      if (descriptor.onError) {
        descriptor.onError(error, descriptor);
      }
      console.error(`Error listening ${descriptor.gqlSubscriptionName}`, error);
    },

    () => console.log(`${descriptor.gqlSubscriptionName} listener STOPED`)
  );
});

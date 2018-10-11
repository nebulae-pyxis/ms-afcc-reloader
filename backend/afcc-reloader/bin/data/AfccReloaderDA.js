'use strict';

const Rx = require('rxjs');
const broker = require('../tools/broker/BrokerFactory')();
const mongoDB = require('./MongoDB').singleton();
const MATERIALIZED_VIEW_TOPIC = 'materialized-view-updates';

class AfccReloaderDA {
    static getAfccOperationConfig$(system, type) {
        const collection = mongoDB.db.collection('AfccOpertationConfig');
        return Rx.Observable.defer(() => collection.findOne({system, type}));
    }
}

module.exports = AfccReloaderDA;
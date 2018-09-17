const Rx = require('rxjs');
const AfccReloaderDA = require('../data/AfccReloaderDA');

let instance;

class AfccReloaderEventConsumer {
  constructor() {}

  handleAfccReloaded$(event) {
    const afccRecharge = event.data;
    delete afccRecharge._id;
    console.log('llega nuevo evento');
    return AfccReloaderDA.persistAfccRecharge(afccRecharge);
  }
}

module.exports = () => {
  if (!instance) {
    instance = new AfccReloaderEventConsumer();
    console.log('AfccReloaderEventConsumer Singleton created');
  }
  return instance;
};

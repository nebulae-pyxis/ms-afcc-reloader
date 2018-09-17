const {
  NEGATIVE_BALANCE_ERROR_CODE,
  PERMISSION_DENIED_ERROR_CODE
} = require('../tools/ErrorCode');
const RoleValidator = require('../tools/RoleValidator');
const Rx = require('rxjs');

class AfccReloadValidationHelper {
  /**
   *
   * @param {*} data data to validate if is a afcc reload balance valid
   * @param {*} authToken token used to validate the user permissions
   * @returns {Boolean} returns a boolan in true if pass all validations or an error specifying whats wrong in the data
   */
  static validateAfccReload$(data, authToken) {
    const method = 'reloadAfcc$';
    // Validate if the user that is performing the operation has the required role.
    return this.checkRole$(authToken, method)
      .mergeMap(() => this.validateAfccReloadBalance$(data.amount, method));
  }
/**
 * validate if the balance to recharge is a positive number
 * @param {*} amount Value to check
 * @param {*} method Method name to log in case of error
 */
  static validateAfccReloadBalance$(amount, method) { 
    return Rx.Observable.of(amount)
      .mergeMap(value => { 
        if (value < 0) {
          return this.createCustomError$(NEGATIVE_BALANCE_ERROR_CODE, method)
        }
        else { 
          return Rx.Observable.of(true);
        }
      })
  }
  /**
   * Checks if the user that is performing the operation has the needed permissions to execute the operation
   * @param {*} authToken Token of the user
   * @param {*} context Name of the microservice
   * @param {*} method Method where the verification is being done
   */
  static checkRole$(authToken, method) {
    return RoleValidator.checkPermissions$(
      authToken.realm_access.roles,
      'Afcc',
      method,
      PERMISSION_DENIED_ERROR_CODE.code,
      PERMISSION_DENIED_ERROR_CODE.description,
      ['pos']
    );
  }

  /**
   * Creates a custom error observable
   * @param {*} errorCode Error code
   * @param {*} methodError Method where the error was generated
   */
  static createCustomError$(errorCode, methodError) {
    return Rx.Observable.throw(
      new CustomError(
        context,
        methodError || "",
        errorCode.code,
        errorCode.description
      )
    );
  }
}

module.exports = AfccReloadValidationHelper;


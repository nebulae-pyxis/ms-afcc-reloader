
//Every single error code
// please use the prefix assigned to this microservice
const INTERNAL_SERVER_ERROR_CODE = {code: 18001, description: 'Internal server error'};
const PERMISSION_DENIED_ERROR_CODE = {code: 18002, description: 'Permission denied'};
const NEGATIVE_BALANCE_ERROR_CODE = {code: 18010, description: 'Negative reload balance is not available'};
const BUSINESS_UNIT_DISABLED_ERROR_CODE = {code: 18011, description: 'Business unit is disabled'};


module.exports =  { 
    INTERNAL_SERVER_ERROR_CODE,
    NEGATIVE_BALANCE_ERROR_CODE,
    BUSINESS_UNIT_DISABLED_ERROR_CODE,
    PERMISSION_DENIED_ERROR_CODE,
} 
'use strict';

exports.__esModule = true;
exports.AppUsersStripeApi = undefined;

var _base = require('./base');

var _smoochMethod = require('../utils/smoochMethod');

var _smoochMethod2 = _interopRequireDefault(_smoochMethod);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @constructor
 * @name AppUsersStripeApi
 * @extends BaseApi
 */
var AppUsersStripeApi = exports.AppUsersStripeApi = function (_BaseApi) {
    _inherits(AppUsersStripeApi, _BaseApi);

    function AppUsersStripeApi() {
        _classCallCheck(this, AppUsersStripeApi);

        return _possibleConstructorReturn(this, _BaseApi.apply(this, arguments));
    }

    return AppUsersStripeApi;
}(_base.BaseApi);

Object.assign(AppUsersStripeApi.prototype, {
    /**
     * Assign a stripe payment method to an existing user
     * @memberof AppUsersStripeApi.prototype
     * @method updateCustomer
     * @param  {string} userId
     * @param  {string} token
     * @return {APIResponse}
     */
    updateCustomer: (0, _smoochMethod2.default)({
        params: ['userId', 'token'],
        path: '/appusers/:userId/stripe/customer',
        func: function updateCustomer(url, userId, token) {
            if (!token) {
                return Promise.reject(new Error('Must provide a Stripe token.'));
            }

            return this.request('POST', url, {
                token: token
            }, {
                allowedAuth: ['jwt']
            });
        }
    }),

    /**
     * Create a one-time stripe transaction
     * @memberof AppUsersStripeApi.prototype
     * @method createTransaction
     * @param  {string} userId
     * @param  {string} actionId
     * @param  {string} token
     * @return {APIResponse}
     */
    createTransaction: (0, _smoochMethod2.default)({
        params: ['userId', 'actionId', 'token'],
        optional: ['token'],
        path: '/appusers/:userId/stripe/transaction',
        func: function createTransaction(url, userId, actionId, token) {
            if (!actionId) {
                return Promise.reject(new Error('Must provide an action id.'));
            }

            var body = {
                actionId: actionId
            };

            if (token) {
                Object.assign(body, {
                    token: token
                });
            }

            return this.request('POST', url, body);
        }
    })
});
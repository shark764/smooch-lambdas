'use strict';

exports.__esModule = true;
exports.WebhooksApi = undefined;

var _base = require('./base');

var _smoochMethod = require('../utils/smoochMethod');

var _smoochMethod2 = _interopRequireDefault(_smoochMethod);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * Webhook properties
 * @typedef WebhookProps
 */

/**
 * @constructor
 * @name WebhooksApi
 * @extends BaseApi
 */
var WebhooksApi = exports.WebhooksApi = function (_BaseApi) {
    _inherits(WebhooksApi, _BaseApi);

    function WebhooksApi() {
        _classCallCheck(this, WebhooksApi);

        var _this = _possibleConstructorReturn(this, _BaseApi.apply(this, arguments));

        _this.allowedAuth = ['jwt'];
        return _this;
    }

    /**
     * Validates the properties sent to the API
     * @memberof WebhooksApi.prototype
     * @method validateProps
     * @param  {WebhookProps}  props      - a properties object
     * @param  {boolean} isTargetRequired - tells if the target property is required (i.e., on creation) [default = false]
     * @return {WebhookProps}             - the properties object passed in parameter
     */


    WebhooksApi.prototype.validateProps = function validateProps(props) {
        var isTargetRequired = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

        if (!props || Object.keys(props).length === 0) {
            throw new Error('Must provide props.');
        }

        if (isTargetRequired && !props.target) {
            throw new Error('Must provide a target.');
        }

        if (props.target && !props.target.startsWith('http://') && !props.target.startsWith('https://')) {
            throw new Error('Malformed target url.');
        }
    };

    return WebhooksApi;
}(_base.BaseApi);

Object.assign(WebhooksApi.prototype, {
    /**
     * List all webhooks
     * @memberof WebhooksApi.prototype
     * @method list
     * @return {APIResponse}
     */
    list: (0, _smoochMethod2.default)({
        params: [],
        path: '/webhooks',
        method: 'GET'
    }),

    /**
     * Creates a webhook
     * @memberof WebhooksApi.prototype
     * @method create
     * @param  {WebhookProps} props - a properties object
     * @return {APIResponse}
     */
    create: (0, _smoochMethod2.default)({
        params: ['props'],
        path: '/webhooks',
        func: function create(url, props) {
            this.validateProps(props, true);
            return this.request('POST', url, props);
        }
    }),

    /**
     * Retrieves a webhook
     * @memberof WebhooksApi.prototype
     * @method get
     * @param  {string} webhookId - an id
     * @return {APIResponse}
     */
    get: (0, _smoochMethod2.default)({
        params: ['webhookId'],
        path: '/webhooks/:webhookId',
        method: 'GET'
    }),

    /**
     * Updates a webhook
     * @memberof WebhooksApi.prototype
     * @method update
     * @param  {string} webhookId    - an id
     * @param  {WebhookProps} props  - a properties object
     * @return {APIResponse}
     */
    update: (0, _smoochMethod2.default)({
        params: ['webhookId', 'props'],
        path: '/webhooks/:webhookId',
        func: function update(url, webhookId, props) {
            this.validateProps(props);
            return this.request('PUT', url, props);
        }
    }),

    /**
     * Deletes a webhook
     * @memberof WebhooksApi.prototype
     * @method delete
     * @param  {string} webhookId - an id
     * @return {APIResponse}
     */
    delete: (0, _smoochMethod2.default)({
        params: ['webhookId'],
        path: '/webhooks/:webhookId',
        method: 'DELETE'
    })
});
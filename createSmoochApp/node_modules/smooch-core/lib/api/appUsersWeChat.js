'use strict';

exports.__esModule = true;
exports.AppUsersWeChatApi = undefined;

var _base = require('./base');

var _smoochMethod = require('../utils/smoochMethod');

var _smoochMethod2 = _interopRequireDefault(_smoochMethod);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

/**
 * @constructor
 * @name AppUsersWeChatApi
 * @extends BaseApi
 */
var AppUsersWeChatApi = exports.AppUsersWeChatApi = function (_BaseApi) {
  _inherits(AppUsersWeChatApi, _BaseApi);

  function AppUsersWeChatApi() {
    _classCallCheck(this, AppUsersWeChatApi);

    return _possibleConstructorReturn(this, _BaseApi.apply(this, arguments));
  }

  return AppUsersWeChatApi;
}(_base.BaseApi);

Object.assign(AppUsersWeChatApi.prototype, {
  /**
   * Generage a QR code to link an existing user with WeChat
   * @memberof AppUsersViberApi.prototype
   * @method getQRCode
   * @param  {string} userId
   * @return {APIResponse}
   */
  getQRCode: (0, _smoochMethod2.default)({
    params: ['userId'],
    path: '/appusers/:userId/integrations/wechat/qrcode',
    method: 'GET'
  })
});
"use strict";

exports.__esModule = true;
exports.DisabledApi = DisabledApi;
function DisabledApi(message) {
    this.message = message;
}

function disabled() {
    throw new Error(this.message);
}

Object.assign(DisabledApi.prototype, {
    create: disabled,
    list: disabled,
    get: disabled,
    delete: disabled
});
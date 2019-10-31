const log = require('serenova-js-utils/lambda/log');

exports.handler = async (event) => {
  log.info('smooch-action-send-message was called', { event });
};

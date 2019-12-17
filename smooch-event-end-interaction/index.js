const log = require('serenova-js-utils/lambda/log');

exports.handler = async (event) => {
  log.info('smooch-event-end-interaction was called', event);
};

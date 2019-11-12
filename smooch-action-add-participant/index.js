const log = require('serenova-js-utils/lambda/log');

exports.handler = async (event) => {
  log.info('smooch-action-add-participant was called', { event });
};

const log = require('serenova-js-utils/lambda/log');

exports.handler = async (event) => {
  const {
    'tenant-id': tenantId,
    'interaction-id': interactionId,
    'interaction-metadata': metadata,
    event: incomingEvent,
  } = JSON.parse(event.Records[0].body);
  const { 'app-id': appId, 'user-id': userId } = metadata;
  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-event-end-interaction was called', { ...logContext, incomingEvent });
};

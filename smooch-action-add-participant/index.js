const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const uuidv1 = require('uuid/v1');

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;
const auth = {
  username: 'titan-gateways@liveops.com',
  password: 'bCsW53mo45WWsuZ5',
};

exports.handler = async (event) => {
  const {
    id,
    'tenant-id': tenantId,
    'sub-id': subId,
    'interaction-id': interactionId,
    metadata,
    parameters,
  } = JSON.parse(event.Records[0]);
  const { 'app-id': appId, 'user-id': userId } = metadata;
  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-action-add-participant was called', { ...logContext, parameters });
  const {
    'user-id': resourceId,
    'session-id': sessionId,
  } = parameters.resource;
  const newMetadata = {
    tenantId,
    interactionId,
    resource: {
      resourceId,
      sessionId,
      type: 'resource',
    },
    metadata,
  };

  const {participants} = metadata;
  const existingParticipant = participants.filter(
    (participant) => participant.resourceId === resourceId,
  );

  if (existingParticipant.length === 0) {
    try {
      const { data } = await joinParticipant(newMetadata);
      log.debug('Added participant to interaction metadata', {
        ...logContext,
        metadata: data,
      });
    } catch (error) {
      log.error(
        'Error updating interaction metadata',
        { ...logContext, newMetadata },
        error,
      );
      throw error;
    }
  }

  try {
    await axios({
      method: 'post',
      url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/actions/${id}?id=${uuidv1()}`,
      data: {
        source: 'smooch',
        subId,
        metadata: {},
        update: {},
      },
      auth,
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to send action response';
    log.error(errMsg, logContext, error);
    throw error;
  }
  log.info('smooch-action-send-message was successful', logContext);
};

async function joinParticipant({
  tenantId,
  interactionId,
  resource,
  metadata,
}) {
  const participants = metadata.participants.push(resource);
  const newMetadata = { ...metadata, participants };

  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata?id=${uuidv1()}`,
    data: {
      source: 'smooch',
      metadata: newMetadata,
    },
    auth,
  });
}

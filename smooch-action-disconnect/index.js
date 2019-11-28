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
    'tenant-id': tenantId,
    'interaction-id': interactionId,
    metadata,
    parameters,
  } = JSON.parse(event.Records[0]);
  const { 'app-id': appId, 'user-id': userId, source } = metadata;
  const {
    id: resourceId,
  } = parameters.resource;
  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
    resourceId,
  };

  log.info('smooch-action-disconnect was called', { ...logContext, parameters });

  if (resourceId) {
    const { participants } = metadata;
    const newParticipants = removeParticipant(participants, resourceId);

    if (participants === newParticipants) {
      log.warn('Participant does not exist', { ...logContext, participants, resourceId });
    } else {
      const newMetadata = { ...metadata, participants: newParticipants };

      try {
        const { data } = await disconnectResource({ tenantId, interactionId, newMetadata });
        log.debug('Removed participant from interaction metadata', { ...logContext, metadata: data });
      } catch (error) {
        log.error('Error updating interaction metadata', logContext, error);
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
  } else {
    log.info('Resource ID not found on disconnect action', logContext);
    switch (source) {
      case 'web':
        log.info('Web messaging interaction ended by resource', logContext);
        break;
      default:
        log.warn('Ignoring customer disconnect action - Source is not valid', { ...logContext, source });
        break;
    }
  }

  log.info('smooch-action-disconnect was successful', logContext);
};

async function disconnectResource({ tenantId, interactionId, metadata }) {
  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata?id=${uuidv1()}`,
    data: {
      source: 'smooch',
      metadata,
    },
  });
}

function removeParticipant(participants, resourceId) {
  return participants.filter((participant) => participant.resourceId !== resourceId);
}

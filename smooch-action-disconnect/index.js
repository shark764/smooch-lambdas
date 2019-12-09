const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const uuidv1 = require('uuid/v1');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;

exports.handler = async (event) => {
  const {
    id,
    'tenant-id': tenantId,
    'sub-id': subId,
    'interaction-id': interactionId,
    metadata,
    parameters,
  } = JSON.parse(event.Records[0].body);
  const { 'app-id': appId, 'user-id': userId, source } = metadata;

  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-action-disconnect was called', { ...logContext });

  if (!parameters.resource || !parameters.resource.id) {
    switch (source) {
      case 'web':
        log.info('Web messaging interaction ended by resource', logContext);
        break;
      default:
        log.warn('Ignoring customer disconnect action - Source is not valid', { ...logContext, source });
        break;
    }
    return;
  }

  const {
    id: resourceId,
  } = parameters.resource;
  logContext.resourceId = resourceId;

  const { participants } = metadata;
  const updatedParticipants = participants.filter((participant) => participant['resource-id'] !== resourceId);

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';
    log.error(errMsg, logContext, error);
    throw error;
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);

  if (participants.length !== updatedParticipants.length) {
    log.warn('Participant does not exist', { ...logContext, participants, resourceId });
  } else {
    try {
      metadata.participants = updatedParticipants;
      const { data } = await disconnectResource({ tenantId, interactionId, metadata }, cxAuth);
      log.debug('Removed participant from interaction metadata', { ...logContext, metadata, data });
    } catch (error) {
      log.error('Error updating interaction metadata', logContext, error);
      throw error;
    }
  }

  // Flow Action Response
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
      auth: cxAuth,
    });
  } catch (error) {
    log.error('An Error has occurred trying to send action response', logContext, error);
    throw error;
  }

  // Perform Resource Interrupt
  try {
    await axios({
      method: 'post',
      url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts?id=${uuidv1()}`,
      data: {
        source: 'smooch',
        interruptType: 'resource-disconnect',
        interrupt: {
          resourceId,
        },
      },
      auth: cxAuth,
    });
  } catch (error) {
    log.error('An Error has occurred trying to send resource interrupt', logContext, error);
    throw error;
  }

  log.info('smooch-action-disconnect was successful', logContext);
};

async function disconnectResource({ tenantId, interactionId, metadata }, auth) {
  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata?id=${uuidv1()}`,
    data: {
      source: 'smooch',
      metadata,
    },
    auth,
  });
}

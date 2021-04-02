const SmoochCore = require('smooch-core');
const { lambda: { log } } = require('alonzo');
const AWS = require('aws-sdk');
const axios = require('axios');
const { v1: uuidv1 } = require('uuid');

const secretsClient = new AWS.SecretsManager();
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const {
  REGION_PREFIX,
  ENVIRONMENT,
  DOMAIN,
  SMOOCH_API_URL,
} = process.env;

exports.handler = async (event) => {
  const {
    id,
    'tenant-id': tenantId,
    'sub-id': subId,
    'interaction-id': interactionId,
    metadata,
    parameters,
  } = JSON.parse(event.Records[0].body);
  const { 'app-id': appId, 'user-id': userId } = metadata;
  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-action-add-participant was called', {
    ...logContext,
    parameters,
  });
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

  const { participants } = metadata;
  const existingParticipant = participants.find(
    (participant) => participant.resourceId === resourceId,
  );

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    log.error('An Error has occurred trying to retrieve cx credentials', logContext, error);
    throw error;
  }

  const auth = JSON.parse(cxAuthSecret.SecretString);
  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    log.error('An Error has occurred trying to retrieve digital channels credentials', logContext, error);
    throw error;
  }

  const appKeys = JSON.parse(appSecrets.SecretString);
  let smooch;
  try {
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
      serviceUrl: SMOOCH_API_URL,
    });
  } catch (error) {
    log.error('An Error has occurred trying to retrieve digital channels credentials', logContext, error);
    throw error;
  }

  let firstName;
  if (!existingParticipant) {
    try {
      ({
        data: {
          result: {
            firstName,
          },
        },
      } = await fetchUser({ tenantId, userId: resourceId, auth }));
    } catch (error) {
      log.error('Error fetching user information', logContext, error);
      throw error;
    }
  }

  if (!firstName) {
    firstName = 'Agent';
  }

  let updatedMetadata;
  try {
    updatedMetadata = newMetadata.metadata;
    updatedMetadata.participants.push({
      ...newMetadata.resource,
      firstName,
    });
    await updateInteractionMetadata({ tenantId, interactionId, metadata: updatedMetadata });
    log.debug('Added participant to interaction metadata', logContext);
  } catch (error) {
    log.error(
      'Error updating interaction metadata',
      { ...logContext, newMetadata },
      error,
    );
    throw error;
  }

  const connectedMessage = `${firstName} connected.`;

  try {
    await Promise.all(updatedMetadata.participants.map(async (participant) => {
      await exports.sendMessageToParticipant({
        tenantId,
        interactionId,
        resourceId: participant.resourceId,
        sessionId: participant.sessionId,
        messageType: 'received-message',
        message: {
          id: uuidv1(),
          from: 'System',
          timestamp: Date.now(),
          type: 'system',
          text: connectedMessage,
        },
      });
    }));
  } catch (error) {
    log.error('An error occurred sending message to participants', logContext, error);
  }

  try {
    await smooch.appUsers.sendMessage({
      appId,
      userId,
      message: {
        text: connectedMessage,
        role: 'appMaker',
        type: 'text',
        metadata: {
          type: 'system',
          from: 'System',
          interactionId,
        },
      },
    });
  } catch (error) {
    log.error('An error occurred sending message', logContext, error);
    throw error;
  }

  await sendFlowActionResponse({ logContext, actionId: id, subId });
  log.info('smooch-action-add-participant was successful', logContext);
};

async function sendFlowActionResponse({
  logContext, actionId, subId,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${REGION_PREFIX}-${ENVIRONMENT}-send-flow-response`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const data = {
    source: 'smooch',
    subId,
    metadata: {},
    update: {},
  };
  const payload = JSON.stringify({
    tenantId,
    actionId,
    interactionId,
    data,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
}

async function updateInteractionMetadata({
  tenantId,
  interactionId,
  metadata,
}) {
  const QueueName = `${REGION_PREFIX}-${ENVIRONMENT}-update-interaction-metadata`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    tenantId,
    interactionId,
    source: 'smooch',
    metadata,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
}

async function fetchUser({ tenantId, userId, auth }) {
  const url = `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/users/${userId}`;
  return axios({
    method: 'get',
    url,
    auth,
  });
}

exports.sendMessageToParticipant = async function sendMessageToParticipant({
  interactionId,
  tenantId,
  sessionId,
  resourceId,
  message,
  messageType,
}) {
  const parameters = {
    resourceId,
    sessionId,
    tenantId,
    interactionId,
    messageType,
    message,
  };
  const MessageBody = JSON.stringify({
    tenantId,
    interactionId,
    actionId: uuidv1(),
    subId: uuidv1(),
    type: 'send-message',
    ...parameters,
  });
  const QueueName = `${tenantId}_${resourceId}`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();

  const sendSQSParams = {
    MessageBody,
    QueueUrl,
  };

  await sqs.sendMessage(sendSQSParams).promise();
};

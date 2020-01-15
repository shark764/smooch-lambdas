const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const uuidv1 = require('uuid/v1');
const AWS = require('aws-sdk');

AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

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
  const { 'app-id': appId, 'user-id': userId } = metadata;

  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };

  log.info('smooch-action-disconnect was called', { ...logContext });

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

  // Customer disconnect (has no resource attached to the disconnect signal)
  if (!parameters.resource || !parameters.resource.id) {
    log.info('Customer Disconnect - removing all participants', logContext);
    metadata.participants = [];
    try {
      await updateInteractionMetadata({ tenantId, interactionId, metadata });
    } catch (error) {
      log.error('Error updating interaction metadata', logContext, error);
      throw error;
    }
    log.debug('Removed all participants from interaction metadata', { ...logContext, metadata });

    await sendFlowActionResponse({
      logContext, actionId: id, subId, auth: cxAuth,
    });

    return;
  }

  const {
    id: resourceId,
  } = parameters.resource;
  logContext.resourceId = resourceId;

  log.info('Resource disconnect - removing participant', logContext);

  const { participants } = metadata;
  const updatedParticipants = participants.filter((participant) => participant['resource-id'] !== resourceId);

  if (participants.length === updatedParticipants.length) {
    log.warn('Participant does not exist', { ...logContext, participants, resourceId });
  } else {
    try {
      metadata.participants = updatedParticipants;
      await updateInteractionMetadata({ tenantId, interactionId, metadata });
      log.debug('Removed participant from interaction metadata', { ...logContext, metadata });
    } catch (error) {
      log.error('Error updating interaction metadata', logContext, error);
      throw error;
    }
  }

  // Flow Action Response
  await sendFlowActionResponse({
    logContext, actionId: id, subId, auth: cxAuth,
  });

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

async function updateInteractionMetadata({
  tenantId,
  interactionId,
  metadata,
}) {
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-update-interaction-metadata`;
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


async function sendFlowActionResponse({
  logContext, actionId, subId,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-send-flow-response`;
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

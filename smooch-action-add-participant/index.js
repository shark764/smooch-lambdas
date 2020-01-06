const log = require('serenova-js-utils/lambda/log');
const AWS = require('aws-sdk');

const { AWS_REGION, ENVIRONMENT } = process.env;

AWS.config.update({ region: process.env.AWS_REGION });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

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

  if (!existingParticipant) {
    try {
      const updatedMetadata = newMetadata.metadata;
      updatedMetadata.participants.push(newMetadata.resource);
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
  }

  await sendFlowActionResponse({ logContext, actionId: id, subId });
  log.info('smooch-action-add-participant was successful', logContext);
};

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

/* eslint-disable import/no-extraneous-dependencies */
const {
  lambda: { log },
} = require('alonzo');
const AWS = require('aws-sdk');

const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const docClient = new AWS.DynamoDB.DocumentClient();

const { AWS_REGION, ENVIRONMENT } = process.env;

async function checkIfClientIsDisconnected({
  latestAgentMessageTimestamp,
  disconnectTimeoutInMinutes,
  userId,
  logContext,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-smooch-client-disconnect-checker`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const DelaySeconds = Math.min(disconnectTimeoutInMinutes, 15) * 60;
  const MessageBody = JSON.stringify({
    interactionId,
    tenantId,
    userId,
    latestAgentMessageTimestamp,
    disconnectTimeoutInMinutes,
  });
  const sqsMessageAction = {
    MessageBody,
    QueueUrl,
    DelaySeconds,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
}

async function shouldCheckIfClientIsDisconnected({ userId, logContext }) {
  let smoochInteractionRecord;
  try {
    smoochInteractionRecord = await docClient
      .get({
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
        Key: {
          SmoochUserId: userId,
        },
      })
      .promise();
  } catch (error) {
    log.error('Failed to get smooch interaction record', logContext, error);
    throw error;
  }

  const interactionItem = smoochInteractionRecord && smoochInteractionRecord.Item;
  const hasInteractionItem = interactionItem && Object.entries(interactionItem).length !== 0;
  const latestCustomerMsgTs = interactionItem && interactionItem.LatestCustomerMessageTimestamp;
  const latestAgentMsgTs = interactionItem && interactionItem.LatestAgentMessageTimestamp;

  if (!hasInteractionItem) {
    return false;
  }
  // No customer messages, or no agent messages. Check if client is active
  if (!latestCustomerMsgTs || !latestAgentMsgTs) {
    return true;
  }
  if (latestCustomerMsgTs > latestAgentMsgTs) {
    return true;
  }
  return false;
}

async function getClientInactivityTimeout({ logContext }) {
  const { tenantId, smoochIntegrationId: integrationId, source } = logContext;
  let smoochIntegration;
  let clientDisconnectMinutes;
  let active;
  try {
    smoochIntegration = await docClient
      .get({
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        Key: {
          'tenant-id': tenantId,
          id: integrationId,
        },
      })
      .promise();
  } catch (error) {
    log.error('Failed to get smooch interaction record', logContext, error);
    throw error;
  }
  if (smoochIntegration && smoochIntegration.Item) {
    ({
      Item: { 'client-disconnect-minutes': clientDisconnectMinutes, active },
    } = smoochIntegration);
  } else {
    log.debug('No integration found', logContext);
  }
  /**
   * Check if whatsapp integration exists and is active
   */
  if (source === 'whatsapp') {
    if (active) {
      return clientDisconnectMinutes;
    }
    log.debug('Integration found but is inactive', logContext);
    return null;
  }
  return clientDisconnectMinutes;
}

module.exports = {
  checkIfClientIsDisconnected,
  shouldCheckIfClientIsDisconnected,
  getClientInactivityTimeout,
};

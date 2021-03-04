/* eslint-disable import/no-extraneous-dependencies */
const {
  lambda: { log },
} = require('alonzo');
const uuidv1 = require('uuid/v1');
const AWS = require('aws-sdk');
const axios = require('axios');

const { AWS_REGION, DOMAIN, ENVIRONMENT } = process.env;

AWS.config.update({ region: AWS_REGION });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const docClient = new AWS.DynamoDB.DocumentClient();

async function getMetadata({ tenantId, interactionId, auth }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}
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
  }
  return clientDisconnectMinutes;
}

async function sendMessageToParticipants({
  interactionId,
  tenantId,
  message,
  messageType,
  auth,
  logContext,
}) {
  try {
    const { data } = await getMetadata({ tenantId, interactionId, auth });
    log.debug('Got interaction metadata', { ...logContext, interaction: data });
    const { participants } = data;

    await Promise.all(
      participants.map(async (participant) => {
        const { resourceId, sessionId } = participant;

        const payload = {
          actionId: uuidv1(),
          subId: uuidv1(),
          type: 'send-message',
          resourceId,
          sessionId,
          tenantId,
          interactionId,
          messageType,
          message,
        };

        const MessageBody = JSON.stringify(payload);

        const QueueName = `${tenantId}_${resourceId}`;
        const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();

        const sendSQSParams = {
          MessageBody,
          QueueUrl,
        };

        log.info('Sending message to resource', { ...logContext, payload });
        await sqs.sendMessage(sendSQSParams).promise();
      }),
    );
  } catch (error) {
    log.error('Error sending message to participants', logContext, error);
    throw error;
  }
}

async function deleteCustomerInteraction({ logContext }) {
  const { smoochUserId } = logContext;
  const smoochParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
    Key: {
      SmoochUserId: smoochUserId,
    },
    ConditionExpression: 'attribute_exists(SmoochUserId)',
  };

  try {
    await docClient.delete(smoochParams).promise();
  } catch (error) {
    log.info('An error occurred removing the interaction id on the state table. Assuming a previous disconnect has already done this.', logContext, error);
    return 'An error occurred removing the interaction id on the state table';
  }
  log.debug('Removed interaction from state table', logContext);
  return 'deleteCustomerInteraction';
}

async function createMessagingTranscript({ logContext, cxAuth }) {
  const {
    tenantId,
    interactionId,
    smoochUserId: userId,
  } = logContext;
  const { data: { appId, artifactId } } = await getMetadata({
    tenantId,
    interactionId,
    auth: cxAuth,
  });
  let transcriptFile;
  const newLogContext = { ...logContext, artifactId };
  try {
    const { data } = await axios({
      method: 'get',
      url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}`,
      auth: cxAuth,
    });
    log.info('artifact found for interaction', { ...newLogContext, artifact: data });
    transcriptFile = data.files.find((f) => f.metadata && f.metadata.transcript === true);
  } catch (error) {
    log.error('Error retrieving artifact', newLogContext);
    throw error;
  }

  if (!transcriptFile) {
    const QueueName = `${AWS_REGION}-${ENVIRONMENT}-create-messaging-transcript`;
    const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
    const payload = JSON.stringify({
      tenantId,
      interactionId,
      appId,
      userId,
      artifactId,
    });

    const sqsMessageAction = {
      MessageBody: payload,
      QueueUrl,
    };

    log.info('Sending message to create-messaging-transcript Queue', newLogContext);

    await sqs.sendMessage(sqsMessageAction).promise();
  } else {
    log.info('Transcript file not created, file already exists', newLogContext);
    return 'Transcript file not created, file already exists';
  }
  return 'createMessagingTranscript';
}

async function checkIfClientPastInactiveTimeout({
  delayMinutes, userId, logContext,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-smooch-whatsapp-disconnect-checker`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const DelaySeconds = Math.min(delayMinutes, 15) * 60;
  const MessageBody = JSON.stringify({
    interactionId,
    tenantId,
    userId,
  });
  const sqsMessageAction = {
    MessageBody,
    QueueUrl,
    DelaySeconds,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
}

async function performCustomerDisconnect({ logContext, cxAuth }) {
  const { tenantId, interactionId } = logContext;
  log.info(
    'Performing Customer Disconnect',
    logContext,
  );
  try {
    const { data } = await axios({
      method: 'post',
      url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts?id=${uuidv1()}`,
      data: {
        source: 'smooch',
        interruptType: 'customer-disconnect',
        interrupt: {},
      },
      auth: cxAuth,
    });
    log.info('Performed Customer Disconnect', { ...logContext, response: data });
  } catch (error) {
    if (error.response.status !== 404) {
      log.error(
        'An Error has occurred trying to send customer interrupt',
        logContext,
        error,
      );
      throw error;
    } else {
      log.debug('Already received a first customer disconnect', { ...logContext, response: error.response });
      return 'Already received a first customer disconnect';
    }
  }
  return 'performCustomerDisconnect';
}

async function sendEndingInteractionNotification({ logContext, cxAuth }) {
  const { tenantId, interactionId } = logContext;
  const { data } = await getMetadata({
    tenantId,
    interactionId,
    auth: cxAuth,
  });
  const { participants } = data;

  await Promise.all(
    participants.map(async (participant) => {
      const { resourceId, sessionId } = participant;
      const QueueName = `${tenantId}_${resourceId}`;
      const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
      const payload = JSON.stringify({
        tenantId,
        actionId: uuidv1(),
        interactionId,
        resourceId,
        sessionId,
        type: 'send-message',
        messageType: 'show-banner',
        notification: 'whatsapp-customer-disconnect',
      });
      const sqsMessageAction = {
        MessageBody: payload,
        QueueUrl,
      };
      log.info('Sending customer interaction ending after 24 hours notification', { ...logContext, payload });
      await sqs.sendMessage(sqsMessageAction).promise();
    }),
  );
  return 'sendEndingInteractionNotification';
}

async function disconnectClient({ logContext, cxAuth }) {
  await performCustomerDisconnect({ logContext, cxAuth });
  log.info('Deleting customer interaction', logContext);
  await deleteCustomerInteraction({ logContext });
  log.info('Creating interaction transcript', logContext);
  await createMessagingTranscript({ logContext, cxAuth });
  if (logContext.source === 'whatsapp') {
    log.info('Sending Notification of interaction expiration', logContext);
    await sendEndingInteractionNotification({ logContext, cxAuth });
    return 'whatspp disconnectClient';
  }
  return 'non-whatspp disconnectClient';
}

module.exports = {
  checkIfClientIsDisconnected,
  shouldCheckIfClientIsDisconnected,
  getClientInactivityTimeout,
  getMetadata,
  sendMessageToParticipants,
  checkIfClientPastInactiveTimeout,
  disconnectClient,
  performCustomerDisconnect,
  deleteCustomerInteraction,
  createMessagingTranscript,
  sendEndingInteractionNotification,
};

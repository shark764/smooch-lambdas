const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const AWS = require('aws-sdk');
const uuidv1 = require('uuid/v1');

const DISCONNECT_TIMEOUT_MINUTES = 1440;
const DELAY_MINUTES = 15;

const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
} = process.env;

AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();
const docClient = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

exports.handler = async (event) => {
  const {
    interactionId: interactionIdToCheck,
    tenantId,
    userId, // Smooch User/Customer ID
  } = JSON.parse(event.Records[0].body);
  const logContext = { interactionIdToCheck, tenantId, smoochUserId: userId };

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient
      .getSecretValue({
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
      })
      .promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';
    log.error(errMsg, logContext, error);
    throw error;
  }
  const cxAuth = JSON.parse(cxAuthSecret.SecretString);
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
  const interactionId = interactionItem && interactionItem.InteractionId;
  const LatestCustomerMessageTimestamp = interactionItem
    && interactionItem.LatestWhatsappCustomerMessageTimestamp;
  logContext.hasInteractionItem = hasInteractionItem;
  logContext.interactionId = interactionId;

  if (!hasInteractionItem || !interactionId) {
    log.info('No active interaction for user', logContext);
    return;
  }
  if (interactionIdToCheck !== interactionId) {
    log.info('Check Event for an old interaction. Not disconnecting client.', logContext);
    return;
  }
  if (!LatestCustomerMessageTimestamp) {
    log.info('Customer Message Timestamp does not exists', logContext);
    throw new Error('Customer Message Timestamp does not exists');
  }

  const clientTimeDifference = Math.abs(
    new Date(
      Math.round((new Date()).getTime()),
    )
    - new Date(
      LatestCustomerMessageTimestamp,
    ),
  );
  if (DISCONNECT_TIMEOUT_MINUTES < DELAY_MINUTES) {
    log.error('Disconnect Timeout cannot be less than Delay Minutes', logContext);
    return;
  }
  let newDelayMinutes;
  const clientTimeDifferenceInMinutes = Math.floor((clientTimeDifference / 1000) / 60);
  if (clientTimeDifferenceInMinutes >= DISCONNECT_TIMEOUT_MINUTES) {
    log.debug('Disconnecting whatsapp customer', logContext);
    await disconnectClient({ logContext, cxAuth });
  } else {
    newDelayMinutes = Math.min(DELAY_MINUTES,
      (DISCONNECT_TIMEOUT_MINUTES - clientTimeDifferenceInMinutes));
    newDelayMinutes = (newDelayMinutes < DELAY_MINUTES) ? newDelayMinutes - 1 : DELAY_MINUTES;
    if (newDelayMinutes > 0) {
      log.info('Setting delayMinutes ', { ...logContext, delayMinutes: newDelayMinutes });
      await checkIfClientPastInactiveTimeout({
        delayMinutes: newDelayMinutes,
        userId,
        logContext,
      });
    } else {
      log.debug('Disconnecting whatsapp customer', logContext);
      await disconnectClient({ logContext, cxAuth });
    }
  }
};

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
    if (error.response.status === 404) {
      log.debug('Already received a first customer disconnect', { ...logContext, response: error.response });
    } else {
      log.error(
        'An Error has occurred trying to send customer interrupt',
        logContext,
        error,
      );
      throw error;
    }
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
  }

  log.debug('Removed interaction from state table', logContext);
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

async function createMessagingTranscript({ logContext, cxAuth }) {
  const {
    tenantId,
    interactionId,
    smoochUserId: userId,
  } = logContext;
  const { data: { appId, artifactId } } = await getMetadata({ tenantId, interactionId, cxAuth });
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
  }
}

async function getMetadata({ tenantId, interactionId, cxAuth: auth }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

async function sendEndingInteractionNotification({ logContext, cxAuth }) {
  const { tenantId, interactionId } = logContext;
  const { data } = await getMetadata({ tenantId, interactionId, cxAuth });
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
}

async function disconnectClient({ logContext, cxAuth }) {
  await performCustomerDisconnect({ logContext, cxAuth });
  log.info('Deleting customer interaction');
  await deleteCustomerInteraction({ logContext });
  log.info('Creating interaction transcript', logContext);
  await createMessagingTranscript({ logContext, cxAuth });
  log.info('Sending Notification of interaction expiration');
  await sendEndingInteractionNotification({ logContext, cxAuth });
}

const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const AWS = require('aws-sdk');
const uuidv1 = require('uuid/v1');

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
    tenantId,
    userId, // Smooch User/Customer ID
    latestAgentMessageTimestamp,
    disconnectTimeoutInMinutes,
  } = JSON.parse(event.Records[0].body);
  const logContext = { tenantId, smoochUserId: userId };

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
    && interactionItem.LatestCustomerMessageTimestamp;
  logContext.hasInteractionItem = hasInteractionItem;
  logContext.interactionId = interactionId;

  if (!hasInteractionItem || !interactionId) {
    log.info('No active interaction for user', logContext);
    return;
  }

  // how much time has passed between latest agent message and now.
  const timeDifference = Math.abs(
    new Date(
      Math.round((new Date()).getTime()),
    )
    - new Date(
      latestAgentMessageTimestamp,
    ),
  );
  const timeDifferenceInMinutes = Math.floor((timeDifference / 1000) / 60);
  if (timeDifferenceInMinutes < disconnectTimeoutInMinutes) {
    const newTimeout = disconnectTimeoutInMinutes - timeDifferenceInMinutes;
    await checkIfClientIsDisconnected({
      latestAgentMessageTimestamp,
      disconnectTimeoutInMinutes: newTimeout,
      userId,
      logContext,
    });
  } else if (!LatestCustomerMessageTimestamp) {
    log.info('Customer is inactive', logContext);
    await performCustomerDisconnect({
      tenantId, interactionId, logContext, cxAuth,
    });
    await deleteCustomerInteraction({ userId, logContext });
  } else if (LatestCustomerMessageTimestamp < latestAgentMessageTimestamp) {
    log.info('Customer is inactive. Last customer message is older than latest agent message', {
      ...logContext,
      LatestCustomerMessageTimestamp,
      latestAgentMessageTimestamp,
    });
    await performCustomerDisconnect({
      tenantId, interactionId, logContext, cxAuth,
    });
    await deleteCustomerInteraction({ userId, logContext });
  } else {
    log.info(
      'Last customer message is newer. Customer is active.',
      logContext,
    );
  }
};

async function performCustomerDisconnect({
  tenantId, interactionId, logContext, cxAuth,
}) {
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

async function deleteCustomerInteraction({ userId, logContext }) {
  const smoochParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
    Key: {
      SmoochUserId: userId,
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

async function checkIfClientIsDisconnected({
  latestAgentMessageTimestamp, disconnectTimeoutInMinutes, userId, logContext,
}) {
  const { tenantId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-smooch-client-disconnect-checker`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const DelaySeconds = Math.min(disconnectTimeoutInMinutes, 15) * 60;
  const MessageBody = JSON.stringify({
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

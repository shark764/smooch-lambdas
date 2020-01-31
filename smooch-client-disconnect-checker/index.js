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

exports.handler = async (event) => {
  const {
    tenantId,
    userId, // Smooch User/Customer ID
    latestAgentMessageTimestamp,
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

  if (!LatestCustomerMessageTimestamp) {
    log.info('Customer is inactive', logContext);
    await performCustomerDisconnect({
      tenantId, interactionId, logContext, cxAuth,
    });
  } else if (LatestCustomerMessageTimestamp < latestAgentMessageTimestamp) {
    log.info('Customer is inactive. Last customer message is older than latest agent message', {
      ...logContext,
      LatestCustomerMessageTimestamp,
      latestAgentMessageTimestamp,
    });
    await performCustomerDisconnect({
      tenantId, interactionId, logContext, cxAuth,
    });
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
    log.error(
      'An Error has occurred trying to send customer interrupt',
      logContext,
      error,
    );
    throw error;
  }
}

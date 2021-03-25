const { lambda: { log } } = require('alonzo');
const AWS = require('aws-sdk');
const { disconnectClient, checkIfClientIsDisconnected } = require('./resources/commonFunctions');

const secretsClient = new AWS.SecretsManager();
const docClient = new AWS.DynamoDB.DocumentClient();

const {
  REGION_PREFIX,
  ENVIRONMENT,
} = process.env;

exports.handler = async (event) => {
  const {
    interactionId: interactionIdToCheck,
    tenantId,
    userId, // Smooch User/Customer ID
    latestAgentMessageTimestamp,
    disconnectTimeoutInMinutes,
  } = JSON.parse(event.Records[0].body);
  const logContext = { interactionIdToCheck, tenantId, smoochUserId: userId };

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient
      .getSecretValue({
        SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-cx`,
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
        TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-interactions`,
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
    return 'no interaction';
  }

  if (interactionIdToCheck !== interactionId) {
    log.info('Check Event for an old interaction. Not disconnecting client.', logContext);
    return 'old interaction';
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
    return 'checking if client disconnected';
  }
  if (!LatestCustomerMessageTimestamp) {
    log.info('Customer is inactive', logContext);
    await disconnectClient({ logContext, cxAuth });
    return 'disconnected client. no latest customer message timestamp.';
  }
  if (LatestCustomerMessageTimestamp < latestAgentMessageTimestamp) {
    log.info('Customer is inactive. Last customer message is older than latest agent message', {
      ...logContext,
      LatestCustomerMessageTimestamp,
      latestAgentMessageTimestamp,
    });
    await disconnectClient({ logContext, cxAuth });
    return 'disconnected client. last customer message is older.';
  }
  log.info(
    'Last customer message is newer. Customer is active.',
    logContext,
  );
  return 'customer is active';
};

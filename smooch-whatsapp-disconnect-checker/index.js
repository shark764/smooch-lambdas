const { lambda: { log } } = require('alonzo');
const AWS = require('aws-sdk');
const { disconnectClient, checkIfClientPastInactiveTimeout } = require('./resources/commonFunctions');

const DISCONNECT_TIMEOUT_MINUTES = 1440;
const DELAY_MINUTES = 15;

const {
  AWS_REGION,
  ENVIRONMENT,
} = process.env;

AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const {
    interactionId: interactionIdToCheck,
    tenantId,
    userId, // Smooch User/Customer ID
  } = JSON.parse(event.Records[0].body);
  const logContext = {
    interactionIdToCheck, tenantId, smoochUserId: userId, source: 'whatsapp',
  };

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
    return 'no interaction';
  }
  if (interactionIdToCheck !== interactionId) {
    log.info('Check Event for an old interaction. Not disconnecting client.', logContext);
    return 'old interaction';
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
  let newDelayMinutes;
  const clientTimeDifferenceInMinutes = Math.floor((clientTimeDifference / 1000) / 60);

  if (clientTimeDifferenceInMinutes >= DISCONNECT_TIMEOUT_MINUTES) {
    log.debug('Disconnecting whatsapp customer', logContext);
    await disconnectClient({ logContext, cxAuth });
    return 'customer disconnected past timeout';
  }

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
    return 'delaying disconnect';
  }

  log.debug('Disconnecting whatsapp customer', logContext);
  await disconnectClient({ logContext, cxAuth });
  return 'customer disconnected';
};

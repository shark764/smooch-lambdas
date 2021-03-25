const { lambda: { log } } = require('alonzo');
const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const uuidv1 = require('uuid/v1');
const { sendMessageToParticipants } = require('./resources/commonFunctions');

const secretsClient = new AWS.SecretsManager();
const docClient = new AWS.DynamoDB.DocumentClient();

const {
  REGION_PREFIX,
  ENVIRONMENT,
  SMOOCH_API_URL,
} = process.env;

exports.handler = async (event) => {
  const {
    'tenant-id': tenantId,
    'interaction-id': interactionId,
    metadata,
    parameters,
    id: actionId,
    'sub-id': subId,
  } = JSON.parse(event.Records[0].body);

  const { 'app-id': appId, 'user-id': userId, source } = metadata;
  const { message, from } = parameters;
  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
    actionId,
    subId,
  };
  let newMessage = message;

  log.info('smooch-action-collect-message-response was called', { ...logContext, parameters });

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

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient
      .getSecretValue({
        SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-cx`,
      })
      .promise();
  } catch (error) {
    log.error('An Error has occurred trying to retrieve cx credentials', logContext, error);
    throw error;
  }
  const auth = JSON.parse(cxAuthSecret.SecretString);

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
  const activeInteractionId = interactionItem && interactionItem.InteractionId;
  if (!hasInteractionItem || !activeInteractionId) {
    log.warn('No active interaction exists', logContext);
    return;
  }
  if (interactionId !== activeInteractionId) {
    log.warn('Got action request from old interaction', logContext);
    return;
  }

  let collectActions = interactionItem && interactionItem.CollectActions;

  if (source === 'web') {
    const existingAction = collectActions.find(
      (action) => action.actionId === actionId,
    );
    if (existingAction) {
      log.warn('Actions already exists in pending interactions', { ...logContext, actionId });
      return;
    }
    collectActions.push({ actionId, subId });
  } else {
    if (collectActions && (collectActions.length > 0)) {
      log.warn('Collect Actions already exists, overwriting with new action', logContext);
    }
    collectActions = [{ actionId, subId }];
  }

  await exports.setCollectActions({
    collectAction: collectActions,
    userId: logContext.smoochUserId,
    logContext,
  });

  if (source === 'web') {
    if (message.length > 128) {
      log.warn('Message contains more than 128 characters', logContext);
      newMessage = `${message.substring(0, 124)}...`;
    }

    try {
      await smooch.appUsers.sendMessage({
        appId,
        userId,
        message: {
          type: 'form',
          role: 'appMaker',
          fields: [{
            type: 'text',
            name: 'collect-message',
            label: newMessage,
          }],
          blockChatInput: false,
          metadata: {
            subId,
            actionId,
            from,
            type: 'system',
            interactionId,
          },
        },
      });
    } catch (error) {
      log.error('Error sending web collect-message ', logContext, error);
      throw error;
    }
  } else {
    try {
      await smooch.appUsers.sendMessage({
        appId,
        userId,
        message: {
          text: message,
          type: 'text',
          role: 'appMaker',
          metadata: {
            type: 'system',
            from,
            interactionId,
          },
        },
      });
    } catch (error) {
      log.error('Error sending whatsapp collect message ', logContext, error);
      throw error;
    }

    /**
     * NON-WEB CHAT
     * Send label to resources
     * We send system message to participants as soon as collect message
     * is sent to customer, since We cannot send form type messages,
     * then there is no way to get question from collect message on customer response.
     */
    const messageToParticipants = {
      id: uuidv1(),
      from: 'System',
      timestamp: Date.now(),
      type: 'system',
      text: newMessage,
    };
    try {
      await sendMessageToParticipants({
        interactionId,
        tenantId,
        message: messageToParticipants,
        messageType: 'received-message',
        auth,
        logContext,
      });
      log.debug('Sent collect-message label to participants for non-web conversations', {
        ...logContext,
        message: messageToParticipants,
      });
    } catch (error) {
      log.error('Error sending collect-message label to participants', logContext, error);
    }
  }

  log.info('smooch-action-collect-message-response was successful', logContext);
};

exports.setCollectActions = async function setCollectActions({
  collectAction, userId, logContext,
}) {
  const params = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-interactions`,
    Key: {
      SmoochUserId: userId,
    },
    UpdateExpression: 'set CollectActions = :c',
    ExpressionAttributeValues: {
      ':c': collectAction,
    },
    ReturnValues: 'UPDATED_NEW',
  };
  try {
    const data = await docClient.update(params).promise();
    log.debug('Updated collectActions', { ...logContext, updated: data });
  } catch (error) {
    log.error('An error ocurred updating collectActions', logContext, error);
    throw error;
  }
};

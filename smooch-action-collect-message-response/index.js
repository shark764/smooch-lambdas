const { lambda: { log } } = require('alonzo');
const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

const {
  AWS_REGION,
  ENVIRONMENT,
  smooch_api_url: smoochApiUrl,
} = process.env;

AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();
const docClient = new AWS.DynamoDB.DocumentClient();

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
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
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
      serviceUrl: smoochApiUrl,
    });
  } catch (error) {
    log.error('An Error has occurred trying to retrieve digital channels credentials', logContext, error);
    throw error;
  }

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
  }

  log.info('smooch-action-collect-message-response was successful', logContext);
};

exports.setCollectActions = async function setCollectActions({
  collectAction, userId, logContext,
}) {
  const params = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
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

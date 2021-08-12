const { lambda: { log } } = require('alonzo');
const SunshineConversationsClient = require('sunshine-conversations-client');
const Joi = require('joi');
const AWS = require('aws-sdk');
const axios = require('axios');
const ednData = require('edn-data');
const { sendMessageToParticipants } = require('./resources/commonFunctions');

const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const {
  REGION_PREFIX,
  ENVIRONMENT,
  DOMAIN,
  SMOOCH_API_URL,
} = process.env;

const actionSchema = Joi.array().items(Joi.object({
  type: Joi.string().valid('link', 'locationRequest', 'postback', 'reply').required(),
  text: Joi.string().required(),
  metadata: Joi.any(),
}).when(Joi.object({ type: Joi.string().valid('link') }).unknown(), {
  then: Joi.object({
    uri: Joi.string().required(),
    default: Joi.string(),
  }),
}).when(Joi.object({ type: Joi.string().valid('postback') }).unknown(), {
  then: Joi.object({
    payload: Joi.string().required(),
  }),
}).when(Joi.object({ type: Joi.string().valid('reply') }).unknown(), {
  then: Joi.object({
    payload: Joi.string().required(),
    iconUrl: Joi.string(),
  }),
}));

const carouselActionSchema = Joi.array().items(Joi.object({
  type: Joi.string().valid('link', 'postback').required(),
  text: Joi.string().required(),
  metadata: Joi.any(),
}).when(Joi.object({ type: Joi.string().valid('link') }).unknown(), {
  then: Joi.object({
    uri: Joi.string().required(),
    default: Joi.boolean(),
  }),
}).when(Joi.object({ type: Joi.string().valid('postback') }).unknown(), {
  then: Joi.object({
    payload: Joi.string().required(),
  }),
}));

const messageSchema = Joi.object({
  type: Joi.string().valid('text', 'image', 'file', 'form', 'carousel', 'list', 'location').required(),
}).when(Joi.object({ type: Joi.string().valid('text') }).unknown(), {
  then: Joi.object({
    text: Joi.string(),
    actions: actionSchema,
  }),
}).when(Joi.object({ type: Joi.string().valid('form') }).unknown(), {
  then: Joi.object({
    blockChatInput: Joi.boolean(),
    fields: Joi.array().items(Joi.object({
      type: Joi.string().valid('email', 'select', 'text').required(),
      name: Joi.string().required(),
      label: Joi.string().required(),
      placeholder: Joi.string(),
      minSize: Joi.number().min(1).max(128),
      maxSize: Joi.number().min(1).max(128),
      text: Joi.string(),
      email: Joi.string(),
      options: Joi.array().items(Joi.object({
        label: Joi.string(),
        name: Joi.string(),
      })),
    })).required(),
  }),
}).when(Joi.object({ type: Joi.string().valid('image') }).unknown(), {
  then: Joi.object({
    mediaUrl: Joi.string().required(),
    altText: Joi.string(),
    text: Joi.string(),
    actions: actionSchema,
  }),
})
  .when(Joi.object({ type: Joi.string().valid('file') }).unknown(), {
    then: Joi.object({
      mediaUrl: Joi.string().required(),
      altText: Joi.string(),
      text: Joi.string(),
    }),
  })
  .when(Joi.object({ type: Joi.string().valid('location') }).unknown(), {
    then: Joi.object({
      coordinates: Joi.object({
        lat: Joi.number().required(),
        long: Joi.number().required(),
      }).required(),
      location: Joi.object({
        address: Joi.string(),
        name: Joi.string(),
      }),
    }),
  })
  .when(Joi.object({ type: Joi.string().valid('carousel') }).unknown(), {
    then: Joi.object({
      displaySettings: Joi.object({
        imageAspectRatio: Joi.string().valid('horizontal', 'square'),
      }),
      items: Joi.array().items(Joi.object({
        title: Joi.string().required(),
        description: Joi.string(),
        mediaUrl: Joi.string(),
        mediaType: Joi.string(),
        altText: Joi.string(),
        size: Joi.string().valid('compact', 'large'),
        actions: carouselActionSchema.required(),
        metadata: Joi.any(),
      })),
    }),
  })
  .when(Joi.object({ type: Joi.string().valid('list') }).unknown(), {
    then: Joi.object({
      actions: carouselActionSchema,
      items: Joi.array().items(Joi.object({
        title: Joi.string().required(),
        description: Joi.string(),
        mediaUrl: Joi.string(),
        mediaType: Joi.string(),
        altText: Joi.string(),
        size: Joi.string().valid('compact', 'large'),
        actions: carouselActionSchema.required(),
        metadata: Joi.any(),
      })),
    }),
  });
exports.handler = async (event) => {
  const {
    body,
  } = event.Records[0];
  const {
    id: actionId,
    'tenant-id': tenantId,
    'sub-id': subId,
    'interaction-id': interactionId,
    metadata,
    parameters,
  } = JSON.parse(body);

  const {
    'app-id': appId,
    'user-id': userId,
    source,
    'conversation-id': conversationId,
  } = metadata;
  const { from, message: ednMessage, 'wait-for-response': waitForResponse } = parameters;
  const message = ednData.parseEDNString(ednMessage, { mapAs: 'object', keywordAs: 'string' });
  const { type: messageType } = message;

  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };
  log.info('smooch-action-rich-send-message was called', { ...logContext, parameters: event.parameters });
  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';
    log.error(errMsg, logContext, error);
    throw error;
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);
  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';
    log.error(errMsg, logContext, error);
    throw error;
  }

  try {
    await messageSchema.validateAsync(message, { abortEarly: false });
  } catch (error) {
    const errMsg = 'Error: invalid message value(s).';
    const validationMessage = error.details
      .map(({ message: errMessage }) => errMessage)
      .join(' / ');

    log.error(errMsg, { ...logContext, validationMessage }, error);
    await sendFlowActionResponse({
      logContext,
      actionId,
      subId,
      response: {
        status: 400,
        message: validationMessage,
      },
      success: false,
    });
    return 'invalid message values';
  }

  let appKeys;

  const defaultClient = SunshineConversationsClient.ApiClient.instance;
  try {
    appKeys = JSON.parse(appSecrets.SecretString);
  } catch (error) {
    const errMsg = 'Failed to parse smooch credentials or credentials does not exists';
    log.error(errMsg, logContext, error);
    return 'failed to parse smooch credentials';
  }

  defaultClient.basePath = SMOOCH_API_URL;
  const { basicAuth } = defaultClient.authentications;
  basicAuth.username = appKeys[`${appId}-id`];
  basicAuth.password = appKeys[`${appId}-secret`];

  let agentDisplayMessage;
  let sendActionResponse = !waitForResponse;
  logContext.source = source;
  logContext.message = message;
  let sendMessageType = 'received-message';
  if (source === 'web' || source === 'messenger' || source === 'whatsapp') {
    if (messageType === 'form' && source === 'web') {
      agentDisplayMessage = message.blockChatInput ? 'Multi-field form sent. Customer chat input blocked until form is submitted.' : 'Multi-field form sent.';
      sendActionResponse = false;
      sendMessageType = 'system-silent';
      log.info(`Received form message for ${source}`, logContext);
    } else if (messageType === 'form' && source !== 'web') {
      log.error(`Unsupported message type for ${source}`, logContext);
      await sendFlowActionResponse({
        logContext,
        actionId,
        subId,
        response: {
          status: 400,
          message: 'Unsupported message type',
        },
        success: false,
      });
      return 'unsupported message type';
    } else {
      log.info(`Received ${messageType} message for ${source}`, logContext);
    }
  } else {
    log.error('Unsupported smooch platform', logContext);
    await sendFlowActionResponse({
      logContext,
      actionId,
      subId,
      response: {
        status: 400,
        message: 'Unsupported platform',
      },
      success: false,
    });
    return 'unsupported platform';
  }

  /**
   * Send smooch message
   */

  const apiInstance = new SunshineConversationsClient.MessagesApi();
  const messagePost = new SunshineConversationsClient.MessagePost();
  messagePost.author = {
    type: 'business',
  };
  messagePost.content = message;
  messagePost.metadata = {
    type: from,
    from,
    interactionId,
    subId,
    actionId,
  };
  let smoochMessage;
  try {
    const data = await apiInstance.postMessage(appId, conversationId, messagePost);
    smoochMessage = data.messages;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to send smooch rich message to customer';
    log.error(errMsg, logContext, error);
    await sendFlowActionResponse({
      logContext, actionId, subId, response: error, success: false,
    });
    return 'failed to send smooch message';
  }
  const messageContent = smoochMessage[0];

  if (!agentDisplayMessage) {
    agentDisplayMessage = smoochMessage[0].content.text;
  }
  smoochMessage = {
    id: smoochMessage[0].id,
    from,
    timestamp: new Date(smoochMessage[0].received),
    type: (sendMessageType === 'system-silent') ? 'system-silent' : from,
    contentType: (sendMessageType === 'system-silent') ? 'text' : smoochMessage[0].content.type,
    text: agentDisplayMessage,
    file: {
      mediaUrl: smoochMessage[0].content.mediaUrl,
      mediaType: smoochMessage[0].content.mediaType,
      mediaSize: smoochMessage[0].content.mediaSize,
    },
  };

  if (source !== 'web' || (source === 'web' && from !== 'CxEngageHiddenMessage')) {
    await sendMessageToParticipants({
      auth: cxAuth,
      interactionId,
      tenantId,
      logContext,
      message: smoochMessage,
      messageType: 'received-message',
    });
  } else {
    log.info(
      'Skipping hidden message sent to participants',
      logContext,
      smoochMessage,
    );
  }

  const response = {
    messageId: smoochMessage.id,
    messageContent: messageContent.content,
    from,
  };

  if (sendActionResponse) {
    await sendFlowActionResponse({
      logContext, actionId, subId, response: messageContent, success: true,
    });
  } else {
    await handleCollectMessage({
      logContext,
      actionId,
      subId,
      userId,
      source,
      messageType,
      interactionId,
    });
  }

  try {
    await axios({
      method: 'post',
      url: `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts`,
      data: {
        source: 'smooch',
        interruptType: 'message-sent',
        interrupt: response,
      },
      auth: cxAuth,
    });
  } catch (err) {
    log.error('Error sending message-sent interrupt', logContext, err);
  }
  return 'smooch-action-send-rich-message successful';
};

async function handleCollectMessage({
  logContext,
  actionId,
  subId,
  userId,
  source,
  messageType,
  interactionId,
}) {
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
    return 'no active interaction';
  }
  if (interactionId !== activeInteractionId) {
    log.warn('Got action request from old interaction', logContext);
    return 'old interaction';
  }

  let collectActions = interactionItem && interactionItem.CollectActions;

  if (source === 'web') {
    const existingAction = collectActions.find(
      (action) => action.actionId === actionId,
    );
    if (existingAction) {
      log.warn('Actions already exists in pending interactions', { ...logContext, actionId });
      return 'pending actions';
    }
    collectActions.push({ actionId, subId, messageType });
  } else {
    if (collectActions && (collectActions.length > 0)) {
      log.warn('Collect Actions already exists, overwriting with new action', logContext);
    }
    collectActions = [{ actionId, subId, messageType }];
  }

  await setCollectActions({
    collectAction: collectActions,
    userId,
    logContext,
  });
  return 'handleCollectMessage successful';
}

async function setCollectActions({
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
}

async function sendFlowActionResponse({
  logContext, actionId, subId, response, success,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${REGION_PREFIX}-${ENVIRONMENT}-send-flow-response`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const data = {
    source: 'smooch',
    subId,
    metadata: {},
    update: {
      response,
      success,
    },
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

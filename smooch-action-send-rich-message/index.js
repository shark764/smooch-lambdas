const { lambda: { log } } = require('alonzo');
const SunshineConversationsClient = require('sunshine-conversations-client');
const Joi = require('joi');
const AWS = require('aws-sdk');
const axios = require('axios');
const { v1: uuidv1 } = require('uuid');
const { getMetadata } = require('./resources/commonFunctions');

const secretsClient = new AWS.SecretsManager();
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const {
  REGION_PREFIX,
  ENVIRONMENT,
  DOMAIN,
  SMOOCH_API_URL,
} = process.env;

const cxApiUrl = `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}`;

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
  .when(Joi.object({ type: Joi.string().valid('carousel', 'list') }).unknown(), {
    then: Joi.object({
      displaySettings: Joi.object({
        imageAspectRatio: Joi.string(),
      }),
      items: Joi.array().items(Joi.object({
        title: Joi.string().required(),
        description: Joi.string(),
        mediaUrl: Joi.string(),
        mediaType: Joi.string(),
        altText: Joi.string(),
        size: Joi.string().valid('compact', 'large'),
        actions: actionSchema,
        metadata: Joi.any(),
      })),
    }),
  });
exports.handler = async (event) => {
  let {
    body,
  } = event.Records[0];

  body = JSON.parse(body);
  const {
    id,
    'tenant-id': tenantId,
    'sub-id': subId,
    'interaction-id': interactionId,
    metadata,
    parameters,
  } = body;

  const {
    'app-id': appId,
    'user-id': userId,
    participants,
    'conversation-id': conversationId,
  } = metadata;
  const { from, message } = parameters;

  const logContext = {
    tenantId,
    interactionId,
    smoochAppId: appId,
    smoochUserId: userId,
  };
  const errResponseUrl = `${cxApiUrl}/v1/tenants/${tenantId}/interactions/${interactionId}`;
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
      .map(({ errMessage }) => errMessage)
      .join(' / ');

    log.error(errMsg, { ...logContext, validationMessage }, error);
    try {
      await axios({
        method: 'post',
        url: errResponseUrl,
        data: { // send error response
          source: 'smooch',
          subId,
          errorMessage: errMsg,
          errorCode: 500,
          metadata: {},
          update: {},
        },
        auth: cxAuth,
      });
    } catch (error2) {
      log.error('An Error ocurred trying to send an error response', logContext, error2);
      throw error2;
    }
    return;
  }

  let appKeys;

  const defaultClient = SunshineConversationsClient.ApiClient.instance;
  try {
    appKeys = JSON.parse(appSecrets.SecretString);
  } catch (error) {
    const errMsg = 'Failed to parse smooch credentials or credentials does not exists';
    log.error(errMsg, logContext, error);

    return;
  }

  defaultClient.basePath = SMOOCH_API_URL;
  const { basicAuth } = defaultClient.authentications;
  basicAuth.username = appKeys[`${appId}-id`];
  basicAuth.password = appKeys[`${appId}-secret`];

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
    type: 'system',
    from,
    interactionId,
  };
  let smoochMessage;
  try {
    const { messages } = apiInstance.postMessage(appId, conversationId, messagePost);
    smoochMessage = messages;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to send smooch rich message to customer';
    log.warn(errMsg, logContext, error);
    try {
      await axios({
        method: 'post',
        url: errResponseUrl,
        data: { // send error response
          source: 'smooch',
          subId,
          errorMessage: errMsg,
          errorCode: 500,
          metadata: {},
          update: {},
        },
        auth: cxAuth,
      });
    } catch (error2) {
      log.warn('An Error ocurred trying to send an error response', logContext, error2);
    }

    throw error;
  }

  let interactionMetadata;
  try {
    ({ data: interactionMetadata } = await getMetadata({
      tenantId,
      interactionId,
      auth: cxAuth,
    }));

    log.debug('Got interaction metadata', {
      ...logContext,
      interaction: interactionMetadata,
    });
  } catch (error) {
    log.error('An error occurred retrieving the interaction metadata', logContext, error);

    throw error;
  }

  smoochMessage = {
    id: smoochMessage.id,
    from,
    timestamp: smoochMessage.received * 1000,
    type: 'system',
    text: smoochMessage.content.text,
  };

  if (
    interactionMetadata.source !== 'web'
    || (interactionMetadata.source === 'web' && from !== 'CxEngageHiddenMessage')
  ) {
    try {
      participants.forEach(async (participant) => {
        await sendSqsMessage({
          tenantId,
          interactionId,
          resourceId: participant['resource-id'],
          sessionId: participant['session-id'],
          messageType: 'received-message',
          message: smoochMessage,
          logContext,
        });
      });
    } catch (error) {
      const errMsg = 'An Error has occurred trying to send rich message to SQS queue';
      log.error(errMsg, logContext, error);
      try {
        await axios({
          method: 'post',
          url: errResponseUrl,
          data: {
            // send error response
            source: 'smooch',
            subId,
            errorMessage: errMsg,
            errorCode: 500,
            metadata: {},
            update: {},
          },
          auth: cxAuth,
        });
      } catch (error2) {
        log.warn(
          'An Error ocurred trying to send an error response',
          logContext,
          error2,
        );
      }
      throw error;
    }
  } else {
    log.info(
      'Skipping hidden message sent to participants',
      logContext,
      smoochMessage,
      participants,
    );
  }

  await sendFlowActionResponse({ logContext, actionId: id, subId });
};

async function sendFlowActionResponse({
  logContext, actionId, subId,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${REGION_PREFIX}-${ENVIRONMENT}-send-flow-response`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const data = {
    source: 'smooch',
    subId,
    metadata: {},
    update: {},
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

async function sendSqsMessage({
  interactionId,
  tenantId,
  sessionId,
  resourceId,
  logContext,
  messageType,
  message,
}) {
  const parameters = {
    resourceId,
    sessionId,
    tenantId,
    interactionId,
    messageType,
    message,
  };
  const action = JSON.stringify({
    tenantId,
    interactionId,
    actionId: uuidv1(),
    subId: uuidv1(),
    type: 'send-message',
    ...parameters,
  });
  const QueueName = `${tenantId}_${resourceId}`;
  let queueUrl;

  try {
    const { QueueUrl } = sqs.getQueueUrl({ QueueName }).promise();
    queueUrl = QueueUrl;
  } catch (error) {
    log.error('An error occured trying to get queue url', logContext, error);
    throw error;
  }

  if (!queueUrl) {
    try {
      const createQueueParams = {
        QueueName,
      };
      const { QueueUrl } = await sqs.createQueue(createQueueParams).promise();
      queueUrl = QueueUrl;
    } catch (error) {
      log.error('An error occured trying to create queue', logContext, error);
      throw error;
    }
  }

  const sendSQSParams = {
    MessageBody: action,
    QueueUrl: queueUrl,
  };

  await sqs.sendMessage(sendSQSParams).promise();
}

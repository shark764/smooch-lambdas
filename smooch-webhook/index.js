/**
 * Lambda that handles smooch webhooks https://docs.smooch.io/rest/#webhooks
 */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const uuidv4 = require('uuid/v4');
const uuidv1 = require('uuid/v1');
const axios = require('axios');
const parsePhoneNumber = require('libphonenumber-js');
const { lambda: { log } } = require('alonzo');
const {
  checkIfClientIsDisconnected,
  shouldCheckIfClientIsDisconnected,
  getClientInactivityTimeout,
  sendMessageToParticipants,
} = require('./resources/commonFunctions');

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;

AWS.config.update({ region: process.env.AWS_REGION });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

exports.handler = async (event) => {
  const eventBody = JSON.parse(event.Records[0].body);
  let body;
  let tenantId;
  if (eventBody.body) {
    ({ body } = eventBody);
    ({ tenantId } = eventBody);
  } else {
    // TODO remove this case after API Gateway is deployed in prod
    body = eventBody;
    log.warn('Using original body', { body });
  }
  const {
    appUser, messages, app, client, trigger, timestamp, activity,
  } = body;
  const { _id: appId } = app;
  const { properties, _id: userId } = appUser;

  // TODO remove this case after API Gateway is deployed in prod
  if (!tenantId) {
    ({ tenantId } = properties);
    log.warn('Getting tenant id from properties', { tenantId });
  }

  const logContext = {
    tenantId,
    smoochAppId: appId,
    smoochUserId: userId,
    smoochTrigger: trigger,
  };

  log.info('smooch-webhook was called', { ...logContext, body, smoochApiUrl });

  if (event.Records.length !== 1) {
    log.error(
      'Did not receive exactly one record from SQS. Handling the first.',
      { ...logContext, records: event.Records },
    );
  }

  if (!client) {
    log.error('No client on Smooch params', { ...logContext, body });
    return 'no client';
  }
  const { platform } = client;
  logContext.smoochPlatform = platform;

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient
      .getSecretValue({
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
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
  log.debug('Smooch interaction record', { ...logContext, smoochInteractionRecord });
  const interactionItem = smoochInteractionRecord && smoochInteractionRecord.Item;
  const hasInteractionItem = interactionItem && Object.entries(interactionItem).length !== 0;
  const interactionId = interactionItem && (
    interactionItem.InteractionId === 'interaction-404' ? undefined : interactionItem.InteractionId
  );

  const { integrationId } = client;
  logContext.hasInteractionItem = hasInteractionItem;
  logContext.interactionId = interactionId;
  logContext.smoochIntegrationId = integrationId;

  switch (trigger) {
    case 'message:appUser': {
      log.debug('Trigger received: message:appUser', logContext);
      if (!messages || messages.length !== 1) {
        log.error(
          'Did not receive exactly one message from Smooch. Handling the first.',
          { ...logContext, messages },
        );
      }
      const message = messages[0];
      const { type, _id: smoochMessageId } = message;
      const collectActions = interactionItem && (
        interactionItem.CollectActions === [] ? undefined : interactionItem.CollectActions
      );

      logContext.collectActions = collectActions;
      logContext.smoochMessageType = type;
      logContext.smoochMessageId = smoochMessageId;

      switch (platform) {
        case 'web': {
          log.debug('Platform received: web', logContext);
          const channelType = 'messaging';
          switch (type) {
            case 'formResponse': {
              log.debug('Web type received: formResponse', { ...logContext, form: message });
              await exports.handleFormResponse({
                appId,
                userId,
                integrationId,
                tenantId,
                interactionId,
                form: message,
                auth,
                logContext,
                properties,
                channelType,
                metadataSource: platform,
              });
              break;
            }
            case 'text':
            case 'image':
            case 'file': {
              log.debug(`Web type received: ${type}`, logContext);
              await exports.handleCustomerMessage({
                hasInteractionItem,
                interactionId,
                tenantId,
                auth,
                logContext,
                appId,
                userId,
                message,
                integrationId,
                properties,
                type,
                channelType,
                metadataSource: platform,
              });
              break;
            }
            default: {
              log.warn('Unsupported web type from Smooch', {
                ...logContext,
                type,
              });
              return 'Unsupported web type';
            }
          }
          break;
        }
        case 'whatsapp': {
          log.debug('Platform received: whatsapp', logContext);

          switch (type) {
            case 'text':
            case 'image':
            case 'file': {
              log.debug(`Whatsapp type received: ${type}`, logContext);
              await exports.handleCustomerMessage({
                hasInteractionItem,
                interactionId,
                tenantId,
                auth,
                logContext,
                appId,
                userId,
                message,
                integrationId,
                properties,
                type,
                channelType: 'sms',
                metadataSource: platform,
                client,
                collectActions,
              });
              break;
            }
            default: {
              log.warn('Unsupported whatsapp type from Smooch', {
                ...logContext,
                type,
              });
              return 'Unsupported whatsapp type';
            }
          }
          break;
        }
        default: {
          log.warn('Unsupported platform from Smooch', {
            ...logContext,
            platform,
          });
          return 'Unsupported platform';
        }
      }
      break;
    }
    case 'conversation:read': {
      log.debug('Trigger received: conversation:read', logContext);
      if (!interactionId) {
        log.info('Trigger received: conversation:read, but no interaction yet. Ignoring.', logContext);
        return 'conversation:read no interaction';
      }
      await exports.sendConversationEvent({
        tenantId,
        interactionId,
        conversationEvent: 'conversation-read',
        timestamp,
        auth,
        logContext,
      });
      break;
    }
    case 'typing:appUser': {
      log.debug('Trigger received: typing:appUser', logContext);
      if (!interactionId) {
        log.info('Trigger received: typing:appUser, but no interaction yet. Ignoring.', logContext);
        return 'typing:appUser no interaction';
      }
      const currentEvent = activity.type === 'typing:start' ? 'typing-start' : 'typing-stop';
      await exports.sendConversationEvent({
        tenantId,
        interactionId,
        conversationEvent: currentEvent,
        timestamp,
        auth,
        logContext,
      });
      break;
    }
    default: {
      log.warn('Unsupported trigger from Smooch', { ...logContext, trigger });
      return 'unsupported trigger';
    }
  }
  return 'success';
};

exports.handleFormResponse = async ({
  appId,
  userId,
  integrationId,
  tenantId,
  interactionId,
  form,
  auth,
  logContext,
  properties,
  channelType,
  metadataSource,
}) => {
  let customerIdentifier = properties.customer;
  if (form.name.includes('Web User ')) {
    customerIdentifier = form
      && form.fields
      && form.fields[0]
      && (form.fields[0].text || form.fields[0].email);
    if (!customerIdentifier) {
      log.warn(
        'Prechat form submitted with no customer identifier (form.field[0].text)',
        { ...logContext, form },
      );
      customerIdentifier = form.name;
    }

    const smooch = await exports.smoochCore({ appId, logContext });

    let smoochUser;
    try {
      smoochUser = await smooch.appUsers.update({
        appId,
        userId,
        appUser: {
          givenName: customerIdentifier,
          properties: {
            ...properties,
            customer: customerIdentifier,
          },
        },
      });
    } catch (error) {
      log.error('Error updating Smooch appUser', logContext, error);
      throw error;
    }
    log.debug('Updated Smooch appUser name', { ...logContext, smoochUser });

    try {
      await exports.createInteraction({
        appId,
        userId,
        tenantId,
        channelType,
        metadataSource,
        integrationId,
        customer: customerIdentifier,
        properties,
        smoochMessageId: form._id,
        auth,
        logContext,
        timestamp: form.received,
      });
    } catch (error) {
      log.error('Failed to create an interaction', logContext, error);
      await exports.deleteSmoochInteraction({ userId, logContext });
      throw error;
    }
  } else {
    const { name } = form.fields[0]; // Form name/type
    switch (name) {
      case 'collect-message':
        await exports.handleCollectMessageResponse({
          tenantId,
          interactionId,
          form,
          auth,
          logContext,
        });
        break;
      default:
        log.warn('Received an unsupported formResponse', {
          ...logContext,
          form,
        });
        return 'unsupported formresponse';
    }
  }
  return 'handleFormResponse Successful';
};

exports.handleCollectMessageResponse = async function handleCollectMessageResponse({
  tenantId,
  interactionId,
  form,
  auth,
  logContext,
}) {
  if (!interactionId) {
    log.info('No interaction ID. Ignoring collect message response.', logContext);
    return 'No Interaction ID';
  }
  const { data: metadata } = await getMetadata({ tenantId, interactionId, auth });
  const { collectActions: pendingActions } = metadata;
  const { actionId, subId } = form.quotedMessage.content.metadata;
  const { text: response, label } = form.fields[0];

  log.debug('DEBUG - Interaction metadata', { ...logContext, metadata, form });
  if (!pendingActions) {
    log.error('There are no pending collect-message actions', {
      ...logContext,
      actionId,
    });
    throw new Error('There are no pending actions');
  }
  // Create updated-metadata by removing incoming collect-action from the interaction metadata
  const updatedActions = metadata.collectActions.filter(
    (action) => action.actionId !== actionId,
  );
  metadata.collectActions = updatedActions;
  metadata.latestMessageSentBy = 'customer';

  // If the updated actions length is different from the old one
  // that means the collect-message response was pending and has been removed
  if (pendingActions.length === updatedActions.length) {
    log.error('Action cannot be found in pending-actions', {
      ...logContext,
      pendingActions,
      incomingAction: actionId,
    });
    throw new Error('Action could not be found in pending-actions');
  }

  // Remove action from pending actions
  try {
    await exports.updateInteractionMetadataAsync({
      tenantId,
      interactionId,
      metadata,
      logContext,
    });
    log.info('Removed collect-message action from metadata', logContext);
  } catch (error) {
    log.warn(
      'Error removing pending collect-message action from metadata. Continuing.',
      logContext,
      error,
    );
  }

  // Update flow
  await exports.sendFlowActionResponse({
    logContext, actionId, subId, response,
  });

  /**
   * Sending label from collect message to participants
   */
  let message = {
    id: uuidv1(),
    from: 'System',
    timestamp: Date.now(),
    type: 'system',
    text: label,
  };

  // Send label to resources
  try {
    await sendMessageToParticipants({
      interactionId,
      tenantId,
      message,
      messageType: 'received-message',
      auth,
      logContext,
    });
    log.debug('Sent collect-message label to participants', {
      ...logContext,
      message,
    });
  } catch (error) {
    log.error(
      'Error sending collect-message label to participants',
      logContext,
      error,
    );
  }

  /**
   * Sending response from collect message to participants
   */
  message = {
    role: form.role,
    source: form.source,
    authorId: form.authorId,
    name: form.name,
    _id: form._id,
    type: form.type,
    received: form.received,
    text: response,
  };

  // Send response to resources
  try {
    await exports.sendCustomerMessageToParticipants({
      tenantId,
      interactionId,
      message,
      auth,
      logContext,
    });
    log.debug('Sent collect-message response to participants', {
      ...logContext,
      message,
    });
  } catch (error) {
    log.error(
      'Error sending collect-message response to participants',
      logContext,
      error,
    );
  }
  return 'handleFormResponse Successful';
};

exports.createInteraction = async ({
  appId,
  userId,
  tenantId,
  metadataSource,
  channelType,
  integrationId,
  customer,
  properties,
  logContext,
  auth,
  smoochMessageId,
  isInteractionDead,
  timestamp,
  latestMessageSentBy = 'customer',
}) => {
  let creatingInteractionParams;
  if (isInteractionDead) {
    creatingInteractionParams = {
      TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
      Item: {
        SmoochUserId: userId,
      },
      UpdateExpression: 'set CreatingSmoochMessageId: :m, InteractionId = :i',
      ExpressionAttributeValues: {
        ':m': smoochMessageId,
        ':i': 'interaction-404',
      },
      ConditionExpression: 'InteractionId <> :i OR CreatingSmoochMessageId = :m',
    };
  } else {
    creatingInteractionParams = {
      TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
      Item: {
        SmoochUserId: userId,
        CreatingSmoochMessageId: smoochMessageId,
        TTL: Math.floor(Date.now() / 1000) + SEVEN_DAYS_IN_SECONDS,
      },
      ConditionExpression: 'attribute_not_exists(SmoochUserId) OR (attribute_exists(SmoochUserId) AND attribute_not_exists(InteractionId) AND CreatingSmoochMessageId = :m)',
      ExpressionAttributeValues: {
        ':m': smoochMessageId,
      },
    };
  }

  try {
    await docClient.put(creatingInteractionParams).promise();
  } catch (error) {
    log.info('Was not able to put row in for creating interaction. Assuming another message is already creating it.', logContext, error);
    return false;
  }

  const interactionId = uuidv4();

  let contactPoint;
  if (metadataSource === 'whatsapp') {
    const smooch = await exports.smoochCore({ appId, logContext });
    const whatsappIntegration = await smooch.integrations.get({
      appId,
      integrationId,
    });
    log.debug('Got whatsapp integration', {
      ...logContext,
      whatsappIntegration,
    });
    contactPoint = parsePhoneNumber(whatsappIntegration.integration.phoneNumber)
      .number;
  } else {
    let webIntegration;
    try {
      webIntegration = await docClient
        .get({
          TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
          Key: {
            'tenant-id': tenantId,
            id: integrationId,
          },
        })
        .promise();
    } catch (error) {
      log.error(
        'Failed to retrieve Smooch integration from DynamoDB',
        logContext,
        error,
      );
      throw error;
    }
    ({ 'contact-point': contactPoint } = webIntegration.Item);
  }

  let artifactId;
  try {
    const response = await axios({
      method: 'post',
      url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts`,
      data: {
        artifactType: 'messaging-transcript',
      },
      auth,
    });
    log.debug('Created Artifact', {
      ...logContext,
      interactionId,
      artifact: response.data,
    });
    ({ artifactId } = response.data);
  } catch (error) {
    log.error(
      'Error creating artifact',
      { ...logContext, interactionId },
      error,
    );
    throw error;
  }

  const interactionParams = {
    tenantId,
    id: interactionId,
    customer,
    contactPoint,
    source: 'smooch',
    channelType,
    direction: 'inbound',
    interaction: {
      customerMetadata: {
        id: customer,
        webClientProperties: properties,
      },
      artifactId,
    },
    metadata: {
      source: metadataSource,
      appId,
      userId,
      customer,
      smoochIntegrationId: integrationId,
      artifactId,
      participants: [],
      firstCustomerMessageTimestamp: timestamp,
      latestMessageSentBy,
    },
  };
  log.debug('Creating interaction', { ...logContext, artifactId, interactionParams });

  const { data } = await axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions`,
    data: interactionParams,
    auth,
  });

  log.info('Created interaction', {
    ...logContext,
    artifactId,
    interaction: data,
    interactionId,
  });

  const smoochInteractionParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
    Key: {
      SmoochUserId: userId,
    },
    UpdateExpression: 'set InteractionId = :i, CollectActions = :c',
    ExpressionAttributeValues: {
      ':i': interactionId,
      ':c': [],
    },
  };
  try {
    await docClient.update(smoochInteractionParams).promise();
  } catch (error) {
    log.fatal('An error occurred updating the interaction id on the state table', { ...logContext, interactionId });
    return false;
  }
  log.debug('Updated smooch interactions state table with interaction', { ...logContext, interactionId });

  return interactionId;
};

exports.sendCustomerMessageToParticipants = async function sendCustomerMessageToParticipants({
  tenantId,
  interactionId,
  contentType,
  message,
  auth,
  logContext,
  metadataSource,
}) {
  let artifactId;
  try {
    const { data } = await getMetadata({ tenantId, interactionId, auth });
    log.debug('Got interaction metadata', { ...logContext, interaction: data });
    const { participants, customer } = data;
    ({ artifactId } = data);

    await Promise.all(
      participants.map(async (participant) => {
        const { resourceId, sessionId } = participant;
        const payload = JSON.stringify({
          tenantId,
          interactionId,
          actionId: uuidv1(),
          subId: uuidv1(),
          type: 'send-message',
          resourceId,
          sessionId,
          messageType: 'received-message',
          message: {
            id: message._id,
            from: customer || message.name,
            contentType,
            timestamp: message.received * 1000,
            type: message.text === 'INTERACTION_NOT_FOUND_ERROR' ? 'system' : 'customer',
            text: message.text,
            file: {
              mediaUrl: message.mediaUrl,
              mediaType: message.mediaType,
              mediaSize: message.mediaSize,
            },
            quotedMessage: message.quotedMessage ? {
              content: message.quotedMessage.content ? {
                id: message.quotedMessage.content._id,
                type: message.quotedMessage.content.type,
                text: message.quotedMessage.content.text,
                file: (message.quotedMessage.content.type === 'file') ? {
                  mediaUrl: message.quotedMessage.content.mediaUrl,
                  mediaType: message.quotedMessage.content.mediaType,
                  mediaSize: message.quotedMessage.content.mediaSize,
                } : {},
              } : {},
            } : {},
          },
        });
        const QueueName = `${tenantId}_${resourceId}`;
        const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
        const sqsMessageAction = {
          MessageBody: payload,
          QueueUrl,
        };

        log.info('Sending message to resource', { ...logContext, payload });
        await sqs.sendMessage(sqsMessageAction).promise();
      }),
    );
  } catch (error) {
    log.error('Error sending message to participants', logContext, error);
    throw error;
  }

  if (message.type === 'file' || message.type === 'image') {
    try {
      await exports.uploadArtifactFile(logContext, artifactId, message, auth);
    } catch (error) {
      log.error('Error uploading file to artifact', logContext, error);
    }
  }

  try {
    await exports.sendReportingEvent({ logContext });
  } catch (error) {
    log.error('An error ocurred sending the reporting event', logContext, error);
  }

  await exports.updateSmoochClientLastActivity({
    latestCustomerMessageTimestamp: message.received * 1000,
    userId: logContext.smoochUserId,
    logContext,
  });

  if (metadataSource === 'whatsapp') {
    await exports.setWhatsappCustomerMessageTimestamp({
      latestCustomerMessageTimestamp: message.received * 1000,
      userId: logContext.smoochUserId,
      logContext: { ...logContext, interactionId },
    });
  }

  return 'sendCustomerMessageToParticipants Successful';
};

exports.sendConversationEvent = async ({
  tenantId,
  interactionId,
  conversationEvent,
  timestamp,
  auth,
  logContext,
}) => {
  try {
    const { data } = await getMetadata({ tenantId, interactionId, auth });
    log.debug('Got interaction metadata', { ...logContext, interaction: data });
    const { participants, latestMessageSentBy } = data;

    await Promise.all(
      participants.map(async (participant) => {
        const { resourceId, sessionId } = participant;
        const payload = JSON.stringify({
          tenantId,
          interactionId,
          actionId: uuidv1(),
          subId: uuidv1(),
          type: 'send-message',
          resourceId,
          sessionId,
          messageType: conversationEvent,
          message: {
            timestamp: timestamp * 1000,
          },
        });
        const QueueName = `${tenantId}_${resourceId}`;
        const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
        const sqsMessageAction = {
          MessageBody: payload,
          QueueUrl,
        };

        log.info('Sending conversation event to resource', {
          ...logContext,
          payload,
        });
        await sqs.sendMessage(sqsMessageAction).promise();
      }),
    );

    if (conversationEvent === 'typing-stop') {
      log.trace('updating smooch client last activity typing-stop', logContext);
      await exports.updateSmoochClientLastActivity({
        latestCustomerMessageTimestamp: (new Date()).getTime(),
        userId: logContext.smoochUserId,
        logContext,
      });
    } else if (conversationEvent !== 'conversation-read') {
      log.trace('updating smooch client last activity, not conversation-read', { ...logContext, conversationEvent });
      await exports.updateSmoochClientLastActivity({
        latestCustomerMessageTimestamp: timestamp * 1000,
        userId: logContext.smoochUserId,
        logContext,
      });
    }

    if (latestMessageSentBy !== 'customer') {
      /**
       * Check for client activity
       */
      const disconnectTimeoutInMinutes = await getClientInactivityTimeout({
        logContext: { ...logContext, source: data.source },
      });
      let shouldCheck;
      if (disconnectTimeoutInMinutes) {
        log.debug('Disconnect Timeout is set. Checking if should check for client disconnect', {
          ...logContext,
          disconnectTimeoutInMinutes,
        });
        shouldCheck = await shouldCheckIfClientIsDisconnected({
          userId: logContext.smoochUserId,
          logContext,
        });
      } else {
        log.debug('There is no Disconnect Timeout set. Not checking for client innactivity', logContext);
      }
      if (shouldCheck) {
        log.debug('Checking for client inactivity', { ...logContext, disconnectTimeoutInMinutes });
        await checkIfClientIsDisconnected({
          latestAgentMessageTimestamp: (new Date()).getTime(),
          disconnectTimeoutInMinutes,
          userId: logContext.smoochUserId,
          logContext,
        });
      }
    }
  } catch (error) {
    log.error(
      'Error sending conversation event to participants',
      logContext,
      error,
    );
    throw error;
  }
  return 'sendConversationEvent Successful';
};

async function getMetadata({ tenantId, interactionId, auth }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

exports.updateInteractionMetadata = async ({
  tenantId,
  interactionId,
  metadata,
}) => {
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-update-interaction-metadata`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    tenantId,
    interactionId,
    source: 'smooch',
    metadata,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
};

exports.updateInteractionMetadataAsync = async ({
  tenantId,
  interactionId,
  metadata,
  logContext,
}) => {
  log.info('Updating interaction metadata', { ...logContext, metadata });

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    log.error('An Error has occurred trying to retrieve cx credentials', logContext, error);

    throw error;
  }

  const auth = JSON.parse(cxAuthSecret.SecretString);

  try {
    const { data } = await axios({
      method: 'post',
      url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata?id=${uuidv1()}`,
      data: {
        source: 'smooch',
        metadata,
      },
      auth,
    });
    log.info('Updated interaction metadata', { ...logContext, data });
  } catch (error) {
    log.error('Failed to update interaction metadata', logContext, error);
    throw error;
  }
};

exports.uploadArtifactFile = async function uploadArtifactFile(
  {
    tenantId, interactionId,
  },
  artifactId,
  message,
) {
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-upload-artifact-file`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    source: 'customer',
    tenantId,
    interactionId,
    artifactId,
    fileData: {
      filename: decodeURIComponent(message.mediaUrl).split('/')[
        message.mediaUrl.split('/').length - 1
      ],
      contentType: message.mediaType,
    },
    message,
  });

  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };

  return sqs.sendMessage(sqsMessageAction).promise();
};

exports.sendReportingEvent = async function sendReportingEvent({
  logContext,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-send-reporting-event`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    tenantId,
    interactionId,
    topic: 'customer-message',
    appName: `${AWS_REGION}-${ENVIRONMENT}-smooch-webhook`,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };

  await sqs.sendMessage(sqsMessageAction).promise();
};

exports.sendFlowActionResponse = async function sendFlowActionResponse({
  logContext, actionId, subId, response,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-send-flow-response`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const data = {
    source: 'smooch',
    subId,
    metadata: {},
    update: {
      response,
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
};

exports.updateSmoochClientLastActivity = async function updateSmoochClientLastActivity({
  latestCustomerMessageTimestamp, userId, logContext,
}) {
  const params = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
    Key: {
      SmoochUserId: userId,
    },
    UpdateExpression: 'set LatestCustomerMessageTimestamp = :t',
    ExpressionAttributeValues: {
      ':t': latestCustomerMessageTimestamp,
    },
    ReturnValues: 'UPDATED_NEW',
  };
  try {
    const data = await docClient.update(params).promise();
    log.debug('Updated lastCustomerMessageTimestamp', { ...logContext, updated: data });
  } catch (error) {
    log.error('An error ocurred updating the latest customer activity', logContext, error);
  }
};

exports.sendSmoochInteractionHeartbeat = async ({
  tenantId,
  interactionId,
  auth,
}) => {
  const { data } = await axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts`,
    data: {
      source: 'smooch',
      interruptType: 'smooch-heartbeat',
      interrupt: {},
    },
    auth,
  });

  log.debug('Interaction heartbeat', {
    interactionId,
    tenantId,
    request: data,
  });
};

exports.handleCustomerMessage = async ({
  hasInteractionItem,
  interactionId,
  tenantId,
  auth,
  logContext,
  appId,
  userId,
  message,
  integrationId,
  properties,
  type,
  metadataSource,
  channelType,
  client,
  collectActions,
}) => {
  if (hasInteractionItem && interactionId) {
    let workingInteractionId = interactionId;

    /** If heartbeat is successfull continue as normal
    if not update the interaction record in DynamoDB */
    try {
      await exports.sendSmoochInteractionHeartbeat({
        tenantId,
        interactionId,
        auth,
      });
    } catch (error) {
      if (error.response.status === 404) {
        log.info(
          'Interaction ID is Invalid. Creating a new Interaction',
          logContext,
        );

        try {
          await axios({
            method: 'post',
            url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts?id=${uuidv1()}`,
            data: {
              source: 'smooch',
              interruptType: 'interaction-disconnect',
              interrupt: {
                interactionId,
              },
            },
            auth,
          });
        } catch (err) {
          log.error(
            'An error has occurred trying to send resource interrupt',
            logContext,
            err,
          );
          if (err.response.status === 404) {
            await exports.sendCustomerMessageToParticipants({
              appId,
              userId,
              tenantId,
              contentType: 'text',
              interactionId,
              message: {
                text: 'INTERACTION_NOT_FOUND_ERROR',
                received: message.received,
              },
              auth,
              logContext,
            });
          }
        }

        try {
          workingInteractionId = await exports.createInteraction({
            appId,
            userId,
            tenantId,
            metadataSource,
            channelType,
            integrationId,
            customer: properties.customer,
            properties,
            smoochMessageId: message._id,
            auth,
            logContext,
            isInteractionDead: true,
            // Creating interaction with first message
            // received timestamp
            timestamp: message.received,
          });
        } catch (err) {
          log.error('Failed to create an interaction', logContext, err);
          await exports.deleteSmoochInteraction({ userId, logContext });
          throw err;
        }
      }
    }

    if (metadataSource !== 'web' && collectActions.length > 0 && type === 'text') {
      const { actionId, subId } = collectActions[0];
      const response = message.text;
      try {
        await exports.sendFlowActionResponse({
          logContext, actionId, subId, response,
        });
      } catch (error) {
        log.error('Error sending flow response', logContext, error);
        throw error;
      }
      await exports.setCollectActions({
        collectAction: [],
        userId: logContext.smoochUserId,
        logContext,
      });
      log.info('Handled non-web collect message', logContext);
    }
    await exports.sendCustomerMessageToParticipants({
      appId,
      userId,
      tenantId,
      contentType: type,
      interactionId: workingInteractionId,
      message,
      auth,
      logContext,
      metadataSource,
    });
    const { data: metadata } = await getMetadata({
      tenantId,
      interactionId: workingInteractionId,
      auth,
    });
    if (metadata.latestMessageSentBy !== 'customer') {
      metadata.latestMessageSentBy = 'customer';
      try {
        await exports.updateInteractionMetadata({
          tenantId,
          interactionId: workingInteractionId,
          metadata,
        });
        log.info('Updated latestMessageSentBy flag from metadata', logContext);
      } catch (error) {
        log.fatal('Error updating latestMessageSentBy flag from metadata', logContext, error);
        throw error;
      }
    }
  } else if (!hasInteractionItem) {
    let customerIdentifier = properties.customer;

    if (!customerIdentifier) {
      if (metadataSource === 'whatsapp') {
        const phoneNumber = parsePhoneNumber(client.displayName);
        if (!phoneNumber) {
          log.error('Unable to parse whatsapp customer phone number', {
            logContext,
            number: client.displayName,
          });
          return 'Unable to parse whatsapp customer phone number';
        }
        customerIdentifier = phoneNumber.number;
      } else {
        log.info(
          'Customer name was not provided to web message, hard-code setting it to "Customer"',
          logContext,
        );
        customerIdentifier = 'Customer';
      }

      let smoochUser;
      const smooch = await exports.smoochCore({ appId, logContext });
      try {
        smoochUser = await smooch.appUsers.update({
          appId,
          userId,
          appUser: {
            givenName: customerIdentifier,
            properties: {
              ...properties,
              customer: customerIdentifier,
            },
          },
        });
      } catch (error) {
        log.error('Error updating Smooch appUser', logContext, error);
        throw error;
      }
      log.debug('Updated Smooch appUser name', { ...logContext, smoochUser });
    }

    let newInteractionId;
    try {
      newInteractionId = await exports.createInteraction({
        appId,
        userId,
        tenantId,
        metadataSource,
        channelType,
        integrationId,
        customer: customerIdentifier,
        properties,
        smoochMessageId: message._id,
        auth,
        logContext,
        // Creating interaction with first message
        // received timestamp
        timestamp: message.received,
      });
    } catch (error) {
      log.error('Failed to create an interaction', logContext, error);
      await exports.deleteSmoochInteraction({ userId, logContext });
      throw error;
    }

    if (metadataSource === 'whatsapp') {
      await exports.setWhatsappCustomerMessageTimestamp({
        latestCustomerMessageTimestamp: (new Date()).getTime(),
        userId: logContext.smoochUserId,
        logContext: { ...logContext, interactionId: newInteractionId },
      });
      await exports.checkIfClientPastInactiveTimeout({
        userId: logContext.smoochUserId,
        logContext: { ...logContext, interactionId: newInteractionId },
      });
    }

    if (type === 'file' || type === 'image') {
      let artifactId;
      try {
        const data = await getMetadata({
          tenantId,
          interactionId: newInteractionId,
          auth,
        });

        // eslint-disable-next-line no-param-reassign
        logContext.interactionId = newInteractionId;
        log.debug('Got interaction metadata', logContext);
        artifactId = data.data.artifactId;
      } catch (error) {
        log.error('An Error ocurred retrieving interaction metadata', logContext, error);
        throw error;
      }
      try {
        await exports.uploadArtifactFile({
          tenantId, interactionId: newInteractionId,
        },
        artifactId, message, auth);
      } catch (error) {
        const errMsg = 'Failed to upload artifact file';
        log.error(errMsg, logContext, error);
        throw error;
      }
    }
  } else {
    log.info('Called handleCustomerMessage, but there is an interactionItem appearing to being created by another message. Ignoring.', logContext);
  }
  return 'handleCustomerMessage Successful';
};

exports.smoochCore = async ({ appId, logContext }) => {
  let accountSecrets;
  try {
    accountSecrets = await secretsClient
      .getSecretValue({
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
      })
      .promise();
  } catch (error) {
    log.error(
      'An Error has occurred trying to retrieve digital channels credentials',
      logContext,
      error,
    );
    throw error;
  }

  const accountKeys = JSON.parse(accountSecrets.SecretString);
  try {
    return new SmoochCore({
      keyId: accountKeys[`${appId}-id`],
      secret: accountKeys[`${appId}-secret`],
      scope: 'app',
      serviceUrl: smoochApiUrl,
    });
  } catch (error) {
    log.error(
      'An Error has occurred trying to initialize SmoochCore',
      logContext,
      error,
    );
    throw error;
  }
};

exports.deleteSmoochInteraction = async ({ userId, logContext }) => {
  log.info('Attempting to delete interaction', logContext);

  const smoochParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
    Key: {
      SmoochUserId: userId,
    },
  };
  try {
    await docClient.delete(smoochParams).promise();
  } catch (error) {
    log.fatal(
      'An error occurred removing the interaction record from the state table. No stuck interactions for smooch user were found.',
      logContext,
      userId,
      error,
    );

    throw error;
  }
  log.debug('Removed interaction from state table', logContext);
};

exports.checkIfClientPastInactiveTimeout = async function checkIfClientPastInactiveTimeout({
  userId,
  logContext,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-smooch-whatsapp-disconnect-checker`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const DelaySeconds = 15 * 60;
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
};

exports.setWhatsappCustomerMessageTimestamp = async function setWhatsappCustomerMessageTimestamp({
  latestCustomerMessageTimestamp, userId, logContext,
}) {
  const params = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch-interactions`,
    Key: {
      SmoochUserId: userId,
    },
    UpdateExpression: 'set LatestWhatsappCustomerMessageTimestamp = :t',
    ExpressionAttributeValues: {
      ':t': latestCustomerMessageTimestamp,
    },
    ReturnValues: 'UPDATED_NEW',
  };
  try {
    const data = await docClient.update(params).promise();
    log.debug('Updated latest whatsapp customer message timestamp', { ...logContext, updated: data });
  } catch (error) {
    log.error('An error ocurred updating the latest whatsapp customer message timestamp', logContext, error);
  }
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
  }
};

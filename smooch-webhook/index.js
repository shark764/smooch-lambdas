/**
 * Lambda that handles smooch webhooks https://docs.smooch.io/rest/#webhooks
 */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const uuidv4 = require('uuid/v4');
const uuidv1 = require('uuid/v1');
const axios = require('axios');
const log = require('serenova-js-utils/lambda/log');

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
  const body = JSON.parse(event.Records[0].body);
  const {
    appUser, messages, app, client, trigger, timestamp, activity,
  } = body;
  const { _id: appId } = app;
  const { properties, _id: userId } = appUser;
  const { interactionId, tenantId } = properties;
  const logContext = {
    interactionId,
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
    return;
  }
  const { platform } = client;

  logContext.smoochPlatform = platform;

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const auth = JSON.parse(cxAuthSecret.SecretString);

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
      const { type } = message;

      const { integrationId } = client;
      logContext.smoochMessageType = type;
      logContext.smoochIntegrationId = integrationId;

      switch (platform) {
        case 'web': {
          log.debug('Platform received: web', logContext);
          switch (type) {
            case 'formResponse': {
              log.debug('Web type received: formResponse', logContext);
              await handleFormResponse({
                appId,
                userId,
                integrationId,
                tenantId,
                interactionId,
                form: message,
                auth,
                logContext,
              });
              break;
            }
            case 'text': {
              log.debug('Web type received: text', logContext);
              await sendCustomerMessageToParticipants({
                appId,
                userId,
                tenantId,
                interactionId,
                message,
                auth,
                logContext,
              });
              break;
            }
            default: {
              log.warn('Unsupported web type from Smooch', {
                ...logContext,
                type,
              });
              break;
            }
          }
          break;
        }
        // case 'whatsapp':
        // case 'messenger':
        default: {
          log.warn('Unsupported platform from Smooch', {
            ...logContext,
            platform,
          });
          break;
        }
      }
      break;
    }
    case 'conversation:read': {
      log.debug('Trigger received: conversation:read', logContext);
      await sendConversationEvent({
        tenantId,
        interactionId,
        conversationEvent: 'conversation-read',
        timestamp,
        auth,
        logContext,
      });
      return;
    }
    case 'typing:appUser': {
      log.debug('Trigger received: typing:appUser', logContext);
      const currentEvent = activity.type === 'typing:start' ? 'typing-start' : 'typing-stop';
      await sendConversationEvent({
        tenantId,
        interactionId,
        conversationEvent: currentEvent,
        timestamp,
        auth,
        logContext,
      });
      return;
    }
    default: {
      log.warn('Unsupported trigger from Smooch', { ...logContext, trigger });
      break;
    }
  }
};

async function handleFormResponse({
  appId,
  userId,
  integrationId,
  tenantId,
  interactionId,
  form,
  auth,
  logContext,
}) {
  if (!interactionId) {
    const customer = form
      && form.fields
      && form.fields[0]
      && (form.fields[0].text || form.fields[0].email);
    if (!customer) {
      log.warn(
        'Prechat form submitted with no customer identifier (form.field[0].text)',
        { ...logContext, form },
      );
      return;
    }

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
    let smooch;
    try {
      smooch = new SmoochCore({
        keyId: accountKeys[`${appId}-id`],
        secret: accountKeys[`${appId}-secret`],
        scope: 'app',
        serviceUrl: smoochApiUrl,
      });
    } catch (error) {
      log.error(
        'An Error has occurred trying to retrieve digital channels credentials',
        logContext,
        error,
      );
      throw error;
    }

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

    const { 'contact-point': contactPoint } = webIntegration.Item;
    const newInteractionId = uuidv4();
    let interaction;

    try {
      const { data } = await createInteraction({
        interactionId: newInteractionId,
        appId,
        userId,
        tenantId,
        source: 'web',
        contactPoint,
        customer,
        auth,
        logContext,
      });
      interaction = data;
      log.debug('Created interaction', { ...logContext, interaction });
    } catch (error) {
      log.error('Failed to create an interaction', logContext, error);
    }

    let smoochUser;

    try {
      smoochUser = await smooch.appUsers.update({
        appId,
        userId,
        appUser: {
          givenName: customer,
          properties: {
            interactionId: newInteractionId,
            customer,
          },
        },
      });
    } catch (error) {
      log.error('Error updating Smooch appUser', logContext, error);

      try {
        await endInteraction({ interactionId: newInteractionId, tenantId });
        log.info('Ended interaction', logContext);
      } catch (err) {
        log.fatal('Error ending interaction', logContext, err);
      }

      try {
        smooch.appUsers.sendMessage({
          appId,
          userId,
          message: {
            role: 'appMaker',
            type: 'text',
            text: 'We could not connect you to an agent. Please try again.',
          },
        });
      } catch (msgError) {
        log.error('Error sending a new message', logContext, msgError);
      }

      return;
    }
    log.debug('Updated Smooch appUser', { ...logContext, smoochUser });
  } else {
    const { name } = form.fields[0]; // Form name/type
    switch (name) {
      case 'collect-message':
        await handleCollectMessageResponse({
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
        break;
    }
  }
}

async function handleCollectMessageResponse({
  tenantId,
  interactionId,
  form,
  auth,
  logContext,
}) {
  const { data: metadata } = await getMetadata({ tenantId, interactionId, auth });
  const { collectActions: pendingActions } = metadata;
  const { actionId, subId } = form.quotedMessage.content.metadata;
  const response = form.fields[0].text;

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

  // Update flow
  await sendFlowActionResponse({ logContext, actionId, subId });

  // Send response to resources
  try {
    sendCustomerMessageToParticipants({
      tenantId,
      interactionId,
      message: response,
      auth,
      logContext,
    });
    log.debug('Sent collect-message response to participants', {
      ...logContext,
      response,
    });
  } catch (error) {
    log.error(
      'Error sending collect-message response to participants',
      logContext,
      error,
    );
    throw error;
  }
  // Remove action from pending actions
  try {
    await updateInteractionMetadata({
      tenantId,
      interactionId,
      metadata,
    });
    log.info('Removed collect-message action from metadata', logContext);
  } catch (error) {
    log.fatal(
      'Error removing pending collect-message action from metadata',
      logContext,
      error,
    );
    throw error;
  }
}

async function createInteraction({
  interactionId,
  appId,
  userId,
  tenantId,
  source,
  contactPoint,
  customer,
  logContext,
  auth,
}) {
  const customerNames = customer.split(' ');
  const firstName = customerNames.shift();
  const lastName = customerNames.join(' ');

  const interaction = {
    tenantId,
    id: interactionId,
    customer,
    contactPoint,
    source: 'smooch',
    channelType: 'messaging',
    direction: 'inbound',
    interaction: {
      customerMetadata: {
        id: customer,
        firstName,
        lastName,
      },
    },
    metadata: {
      source,
      appId,
      userId,
      customer,
      participants: [],
    },
  };
  log.debug('Creating interaction', { ...logContext, interaction });

  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions`,
    data: interaction,
    auth,
  });
}

async function endInteraction({ tenantId, interactionId }) {
  log.debug('Ending interaction', { tenantId, interactionId });

  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-end-interaction`;
  const { QueueUrl } = await sqs.getQueueUrl({ QueueName }).promise();
  const payload = JSON.stringify({
    tenantId,
    interactionId,
  });
  const sqsMessageAction = {
    MessageBody: payload,
    QueueUrl,
  };
  await sqs.sendMessage(sqsMessageAction).promise();
}

async function sendCustomerMessageToParticipants({
  tenantId,
  interactionId,
  message,
  auth,
  logContext,
}) {
  try {
    const { data } = await getMetadata({ tenantId, interactionId, auth });
    log.debug('Got interaction metadata', { ...logContext, interaction: data });
    const { participants } = data;

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
            from: message.name,
            timestamp: message.received * 1000,
            type: 'customer',
            text: message.text,
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
    await sendReportingEvent({ logContext });
  } catch (error) {
    log.error('Error sending message to participants', logContext, error);
    throw error;
  }
}

async function sendConversationEvent({
  tenantId,
  interactionId,
  conversationEvent,
  timestamp,
  auth,
  logContext,
}) {
  try {
    const { data } = await getMetadata({ tenantId, interactionId, auth });
    log.debug('Got interaction metadata', { ...logContext, interaction: data });
    const { participants } = data;

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
  } catch (error) {
    log.error(
      'Error sending conversation event to participants',
      logContext,
      error,
    );
    throw error;
  }
}

async function getMetadata({ tenantId, interactionId, auth }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

async function updateInteractionMetadata({
  tenantId,
  interactionId,
  metadata,
}) {
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
}

async function sendReportingEvent({
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
}

async function sendFlowActionResponse({
  logContext, actionId, subId,
}) {
  const { tenantId, interactionId } = logContext;
  const QueueName = `${AWS_REGION}-${ENVIRONMENT}-send-flow-response`;
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

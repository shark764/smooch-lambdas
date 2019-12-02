/**
 * Lambda that handles smooch webhooks https://docs.smooch.io/rest/#webhooks
 */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const uuidv4 = require('uuid/v4');
const uuidv1 = require('uuid/v1');
const retry = require('async-retry');
const axios = require('axios');
const log = require('serenova-js-utils/lambda/log');

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;
const retries = 2;


AWS.config.update({ region: process.env.AWS_REGION });
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const auth = {
  username: 'titan-gateways@liveops.com',
  password: 'bCsW53mo45WWsuZ5',
};

exports.handler = async (event) => {
  const body = JSON.parse(event.Records[0].body);
  const {
    appUser, messages, app, client, trigger,
  } = body;
  const { _id: appId } = app;
  const { properties, _id: userId } = appUser;
  const { interactionId, tenantId } = properties;
  const logContext = {
    interactionId, tenantId, smoochAppId: appId, smoochUserId: userId, smoochTrigger: trigger,
  };

  log.info('smooch-webhook was called', { ...logContext, body });

  if (event.Records.length !== 1) {
    log.error('Did not receive exactly one record from SQS. Handling the first.', { ...logContext, records: event.Records });
  }

  if (!client) {
    log.error('No client on Smooch params', { ...logContext, body });
    return;
  }
  const { platform } = client;

  logContext.smoochPlatform = platform;

  switch (trigger) {
    case 'message:appUser': {
      log.debug('Trigger received: message:appUser', logContext);
      if (!messages || messages.length !== 1) {
        log.error('Did not receive exactly one message from Smooch. Handling the first.', { ...logContext, messages });
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
                logContext,
              });
              break;
            }
            default: {
              log.warn('Unsupported web type from Smooch', { ...logContext, type });
              break;
            }
          }
          break;
        }
        // case 'whatsapp':
        // case 'messenger':
        default: {
          log.warn('Unsupported platform from Smooch', { ...logContext, platform });
          break;
        }
      }
      break;
    }
    case 'conversation:read': {
      log.debug('Trigger received: conversation:read', logContext);
      // TODO
      log.debug('TODO conversation:read', logContext);
      break;
    }
    case 'typing:appUser': {
      log.debug('Trigger received: typing:appUser', logContext);
      // TODO
      log.debug('TODO typing:appUser', logContext);
      break;
    }
    default: {
      log.warn('Unsupported trigger from Smooch', { ...logContext, trigger });
      break;
    }
  }
};

async function handleFormResponse({
  appId, userId, integrationId, tenantId, interactionId, form, logContext,
}) {
  if (!interactionId) {
    const customer = form && form.fields && form.fields[0]
      && (form.fields[0].text || form.fields[0].email);
    if (!customer) {
      log.warn('Prechat form submitted with no customer identifier (form.field[0].text)', { ...logContext, form });
      return;
    }

    let accountSecrets;

    try {
      accountSecrets = await secretsClient.getSecretValue({
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
      }).promise();
    } catch (error) {
      log.error('An Error has occurred trying to retrieve digital channels credentials', logContext, error);
      throw error;
    }

    const accountKeys = JSON.parse(accountSecrets.SecretString);
    let smooch;
    try {
      smooch = new SmoochCore({
        keyId: accountKeys[`${appId}-id`],
        secret: accountKeys[`${appId}-secret`],
        scope: 'app',
      });
    } catch (error) {
      log.error('An Error has occurred trying to retrieve digital channels credentials', logContext, error);
      throw error;
    }

    let webIntegration;

    try {
      webIntegration = await docClient.get({
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        Key: {
          'tenant-id': tenantId,
          id: integrationId,
        },
      }).promise();
    } catch (error) {
      log.error('Failed to retrieve Smooch integration from DynamoDB', logContext, error);
      throw error;
    }

    const { 'contact-point': contactPoint } = webIntegration.Item;
    const newInteractionId = uuidv4();
    let interaction;

    try {
      const { data } = await createInteraction({
        interactionId: newInteractionId, appId, userId, tenantId, source: 'web', contactPoint, customer, logContext,
      });
      interaction = data;
      log.debug('Created interaction', { ...logContext, interaction });
    } catch (error) {
      log.error('Failed to create an interaction', logContext, error);
    }

    let smoochUser;

    try {
      smoochUser = await retry(async () => smooch.appUsers.update({
        appId,
        userId,
        appUser: {
          properties: {
            interactionId: newInteractionId,
            customer,
          },
        },
      }), { retries });
    } catch (error) {
      log.error('Error updating Smooch appUser', logContext, error);

      let endedInteraction;

      try {
        endedInteraction = await retry(
          async () => endInteraction({ interactionId: newInteractionId, tenantId }), { retries },
        );
        log.info('Ended interaction', { ...logContext, endedInteraction });
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
    // TODO: Add handling for form messages / collect-message-response
    log.debug('TODO handleFormResponse', logContext);
  }
}

async function createInteraction({
  interactionId, appId, userId, tenantId, source, contactPoint, customer, logContext,
}) {
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

function endInteraction({ tenantId, interactionId, logContext }) {
  log.debug('Ending interaction', { ...logContext, tenantId, interactionId });

  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts?id=${uuidv1()}`,
    data: {
      source: 'smooch',
      interruptType: 'customer-disconnect',
      interrupt: {},
    },
    auth,
  });
}

async function sendCustomerMessageToParticipants({
  tenantId, interactionId, message, logContext,
}) {
  try {
    const { data } = await getMetadata({ tenantId, interactionId });
    log.debug('Got interaction metadata', { ...logContext, interaction: data });
    const { participants } = data;

    await Promise.all(participants.map(async (participant) => {
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
          from: message.from,
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
    }));
  } catch (error) {
    log.error('Error sending message to participants', logContext, error);
    throw error;
  }
}

async function getMetadata({ tenantId, interactionId }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata`,
    auth,
  });
}

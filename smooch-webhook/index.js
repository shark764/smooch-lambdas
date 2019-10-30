/**
 * Lambda that handles smooch webhooks https://docs.smooch.io/rest/#webhooks
 */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const uuidv4 = require('uuid/v4');
const uuidv1 = require('uuid/v1');
const retry = require('async-retry');
const axios = require('axios');

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;
const retries = 2;

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const auth = {
  username: 'titan-gateways@liveops.com',
  password: 'bCsW53mo45WWsuZ5',
};

exports.handler = async (event) => {
  console.debug('smooch-webhook', JSON.stringify(event));

  if (event.Records.length !== 1) {
    console.error('Did not receive exactly one record from SQS. Handling the first.', event.Records);
  }
  const body = JSON.parse(event.Records[0].body);
  const {
    appUser, messages, app, client, trigger,
  } = body;
  const { id: appId } = app;
  const { properties, id: userId } = appUser;
  const { interactionId, tenantId } = properties;
  const logContext = {
    interactionId, tenantId, appId, userId,
  };

  console.info('Received event from Smooch', JSON.stringify({ ...logContext, body }));

  if (!client) {
    console.error('No client on Smooch params', JSON.stringify({ ...logContext, body }));
    return;
  }
  const { platform } = client;

  switch (trigger) {
    case 'message:appUser': {
      if (!messages || messages.length !== 1) {
        console.error('Did not receive exactly one message from Smooch. Handling the first.', JSON.stringify({ ...logContext, messages }));
      }
      const message = messages[0];
      const { type } = message;

      const { integrationId } = client;

      switch (platform) {
        case 'web': {
          switch (type) {
            case 'formResponse': {
              handleFormResponse({
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
              sendCustomerMessageToParticipants({
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
              console.warn('Unsupported web type from Smooch', JSON.stringify({ ...logContext, type }));
              break;
            }
          }
          break;
        }
        // case 'whatsapp':
        // case 'messenger':
        default: {
          console.warn('Unsupported platform from Smooch', JSON.stringify({ ...logContext, platform }));
          break;
        }
      }
      break;
    }
    case 'conversation:read': {
      // TODO
      console.log('TODO conversation:read');
      break;
    }
    case 'typing:appUser': {
      // TODO
      console.log('TODO typing:appUser');
      break;
    }
    default: {
      console.warn('Unsupported trigger from Smooch', JSON.stringify({ ...logContext, trigger }));
      break;
    }
  }
};

async function handleFormResponse({
  appId, userId, integrationId, tenantId, interactionId, form, logContext,
}) {
  if (!interactionId) {
    const customer = form && form.fields && form.fields[0] && form.fields[0].text;
    if (!customer) {
      console.warn('Prechat form submitted with no customer identifier (form.field[0].text)', JSON.stringify({ ...logContext, form }));
      return;
    }

    let accountSecrets;
    let smooch;
    let accountKeys;
    try {
      accountSecrets = await secretsClient.getSecretValue({
        SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`,
      }).promise();

      accountKeys = JSON.parse(accountSecrets.SecretString);

      smooch = new SmoochCore({
        keyId: accountKeys[`${tenantId}-id`],
        secret: accountKeys[`${tenantId}-secret`],
        scope: 'app',
      });
    } catch (error) {
      console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
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
      });
    } catch (error) {
      console.error('Failed to retrieve Smooch integration from DynamoDB', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw error;
    }

    const { contactPoint } = webIntegration;
    const newInteractionId = uuidv4();
    const interaction = await createInteraction({
      interactionId: newInteractionId, appId, userId, tenantId, source: 'web', contactPoint, customer, logContext,
    });

    if (interaction) {
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
        console.error('Error updating Smooch appUser', JSON.stringify(error, Object.getOwnPropertyNames(error)));

        let endedInteraction;
        try {
          endedInteraction = await retry(
            async () => endInteraction({ interactionId: newInteractionId, tenantId }), { retries },
          );
          console.log('Ended interaction', JSON.stringify({...logContext, endedInteraction }));
        } catch (err) {
          console.error('Error ending interaction', JSON.stringify(err, Object.getOwnPropertyNames(err)));
        }
        smooch.appUsers.sendMessage({
          appId,
          userId,
          message: {
            role: 'appMaker',
            type: 'text',
            text: 'We could not connect you to an agent. Please try again.',
          },
        });

        return;
      }
      console.log('Updated Smooch appUser', JSON.stringify({ ...logContext, smoochUser }));
    } else {
      console.error('Failed to create interaction', JSON.stringify({ ...logContext, interaction }));
      smooch.appUsers.sendMessage({
        appId,
        userId,
        message: {
          role: 'appMaker',
          type: 'text',
          text: 'We could not connect to an agent. Try again later',
        },
      });
    }
  } else {
    // TODO: Add handling for form messages / collect-message-response
    console.log('TODO handleFormResponse');
  }
}

function createInteraction({
  interactionId, appId, userId, tenantId, source, contactPoint, customer, logContext,
}) {
  const interaction = {
    tenantId,
    id: interactionId,
    customer,
    contactPoint,
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
  console.log('Creating interaction', JSON.stringify({ ...logContext, interaction }));

  return axios({
    method: 'post',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions`,
    data: interaction,
    auth,
  });
}

function endInteraction({ tenantId, interactionId, logContext }) {
  console.log('Ending interaction', JSON.stringify({ ...logContext, tenantId, interactionId }));

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
  tenantId, interactionId, logContext,
}) {
  try {
    const { data } = await getMetadata({ tenantId, interactionId });
    console.log('Got interaction metadata', { ...logContext, interaction: data });
  } catch (error) {
    console.error('Error getting interaction metadata', JSON.stringify({ ...logContext, error }, Object.getOwnPropertyNames(error)));
    throw error;
  }
  console.log('Sending message to resource', { ...logContext });
}

function getMetadata({ tenantId, interactionId }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}`,
    auth,
  });
}

/**
 * Lambda that handles smooch webhooks https://docs.smooch.io/rest/#webhooks
 **/

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const uuidv4 = require('uuid/v4');

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

exports.handler = async (event) => {
  console.debug('smooch-webhook', JSON.stringify(event));

  if (event.Records.length !== 1) {
    console.error('Did not receive exactly one record from SQS. Handling the first.', event.Records);
  }
  const body = JSON.parse(event.Records[0].body);
  const { appUser, messages, app, client, trigger } = body;
  const { id: appId } = app;
  const { properties, id: userId } = appUser;
  const { interactionId, tenantId } = properties;
  const logContext = { interactionId, tenantId, appId, userId };

  console.info('Received event from Smooch', JSON.stringify({ ...logContext, body }));

  if (!client) {
    console.error('No client on Smooch params', JSON.stringify({ ...logContext, body }));
    return;
  }
  const { platform } = client;
  
  switch (trigger) {
    case 'message:appUser': {

      if (!messages || messages.length !== 1) {
        console.error('Did not receive exactly one message from Smooch. Handling the first.', JSON.stringify({ ...logContext, messages}));
      }
      const message = messages[0];
      const { type } = message;

      const { integrationId } = client;

      switch (platform) {
        case 'web': {
          switch (type) {
            case 'formResponse': {
              handleFormResponse({ appId, userId, integrationId, tenantId, interactionId, form: message, logContext });
              break;
            }
            case 'text': {
              sendMessage({ appId, userId, tenantId, interactionId, message, logContext });
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

const handleFormResponse = async ({ appId, userId, integrationId, tenantId, interactionId, form, logContext }) => {
  if (!interactionId) {
    const customer = form && form.fields && form.fields[0] && form.fields[0].text;
    if (!customer) {
      console.warn('Prechat form submitted with no customer identifier (form.field[0].text)', JSON.stringify({ ...logContext, form }));
    }
    const { AWS_REGION, ENVIRONMENT } = process.env;
    let webIntegration;
    try {
      webIntegration = await docClient.get({
        TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
        Key: {
          'tenant-id': tenantId,
          id: integrationId
        }
      });
    } catch (error) {
      console.error('Failed to retrieve Smooch integration from DynamoDB', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      // TODO send message to appUser
      return;
    }
    const { contactPoint } = webIntegration;
    createInteraction({ appId, userId, tenantId, source: 'web', contactPoint, customer, logContext });
  } else {
    // TODO
    console.log('TODO handleFormResponse')
  }
};

const createInteraction = async ({ appId, userId, tenantId, source, contactPoint, customer, logContext }) => {
  const interactionId = uuidv4();
  const interaction = {
    tenantId,
    id: interactionId,
    customer,
    contactPoint,
    channelType: 'messaging',
    direction: 'inbound',
    interaction: {
      customerMetadata: {
        id: customer
      }
    },
    metadata: {
      source,
      appId,
      userId,
      customer,
      participants: []
    }
  };
  console.log('Creating interaction', JSON.stringify({ ...logContext, interaction }));
  // TODO here
  // POST https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions
  //   Authorization	Basic dGl0YW4tZ2F0ZXdheXNAbGl2ZW9wcy5jb206YkNzVzUzbW80NVdXc3VaNQ==
  // see: https://app.logz.io/#/dashboard/kibana/doc/%5BlogzioCustomerIndex%5DYYMMDD/logzioCustomerIndex191018_v23/service?_g=()&id=AW3fP4L4EP4vsmey81FI&accountIds=46022
};

const sendMessage = async ({ appId, userId, tenantId, interactionId, message, logContext }) => {
  // TODO
};

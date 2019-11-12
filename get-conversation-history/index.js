/**
 * Lambda that retrieve conversation history from an interaction
 */

const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();
const auth = {
  username: 'titan-gateways@liveops.com',
  password: 'bCsW53mo45WWsuZ5',
};
const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;


exports.handler = async (event) => {
  const { params } = event;
  const { 'tenant-id': tenantId, 'interaction-id': interactionId } = params;
  const logContext = { tenantId, interactionId };

  log.info('get-conversation-history was called', { ...logContext, params });

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const appKeys = JSON.parse(appSecrets.SecretString);

  let interactionMetadata;
  try {
    const { data } = await getMetadata({ tenantId, interactionId });

    log.debug('Got interaction metadata', { ...logContext, interaction: data });

    interactionMetadata = data;
  } catch (error) {
    const errMsg = 'An error occurred retrieving the interaction metadata';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const { 'app-id': appId, 'user-id': userId, 'customer-name': customerName } = interactionMetadata;
  const smoochApiUrl = `https://api.smooch.io/v1.1/apps/${appId}/appusers/${userId}/messages`;
  let messages;
  logContext.smoochAppId = appId;
  logContext.smoochUserId = userId;

  try {
    const { data } = await axios.get(smoochApiUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${appKeys[`${appId}-id`]}:${appKeys[`${appId}-secret`]}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    messages = data.messages;
  } catch (error) {
    const errMsg = 'An error occurred fetching interaction messages';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  messages = messages.messages
    .filter((message) => (message.role === 'appUser' && message.type !== 'customer') || message.metadata)
    .map((message) => ({
      id: message._id,
      text: message.text,
      type: message.role === 'appMaker' ? message.metadata.type : 'customer',
      from: message.role === 'appMaker' ? message.metadata.from : customerName,
      resourceId: message.role === 'appMaker' ? message.metadata.resourceId : null,
      timestamp: message.received * 1000,
    }));

  log.info('get-conversation-history complete', { ...logContext, messages });

  return {
    status: 200,
    body: { messages },
  };
};

async function getMetadata({ tenantId, interactionId }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}`,
    auth,
  });
}

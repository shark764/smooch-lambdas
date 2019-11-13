/**
 * Lambda that sends messages
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
  const { params, body, identity } = event;
  const { 'tenant-id': tenantId, 'interaction-id': interactionId } = params;
  const { 'user-id': resourceId, name: from } = identity;
  const {
    message,
  } = body;
  const logContext = {
    tenantId,
    interactionId,
    resourceId,
  };

  log.info('send-message was called', {
    ...logContext,
    message,
    from,
  });

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

  const { 'app-id': appId } = interactionMetadata;
  const smoochApiUrl = `https://api.smooch.io/v1.1/apps/${appId}/appusers/${userId}/messages`;
  logContext.smoochAppId = appId;

  let messageSent;
  try {
    const { data } = await axios.post(smoochApiUrl,
      {
        text: message,
        role: 'appMaker',
        type: 'text',
        metadata: {
          type: 'agent',
          from,
          resourceId,
        },
      },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${appKeys[`${appId}-id`]}:${appKeys[`${appId}-secret`]}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      });

    messageSent = data.message;
  } catch (error) {
    const errMsg = 'An error occurred sending message';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  messageSent = {
    id: messageSent._id,
    text: messageSent.text,
    type: 'agent',
    from,
    resourceId,
    timestamp: messageSent.received * 1000,
  };

  log.info('Sent smooch message successfully', { ...logContext, smoochMessage: messageSent });

  return {
    status: 200,
    body: { message: messageSent, interactionId },
  };
};

async function getMetadata({ tenantId, interactionId }) {
  return axios({
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}`,
    auth,
  });
}

const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const AWS = require('aws-sdk');
const { v1: uuidv1 } = require('uuid');

const secretsClient = new AWS.SecretsManager();

const {
  REGION_PREFIX,
  ENVIRONMENT,
  DOMAIN,
} = process.env;

exports.handler = async (event) => {
  const {
    tenantId,
    interactionId,
    actionId,
    data,
  } = JSON.parse(event.Records[0].body);

  const logContext = { tenantId, interactionId };

  try {
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
    const url = `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/actions/${actionId}?id=${uuidv1()}`;

    await axios({
      method: 'post',
      url,
      data,
      auth: cxAuth,
    });
  } catch (error) {
    log.error('An Error has occurred trying to send action response', logContext, error);
    throw error;
  }
};

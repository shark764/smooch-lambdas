const log = require('serenova-js-utils/lambda/log');
const axios = require('axios');
const uuidv1 = require('uuid/v1');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;

exports.handler = async (event) => {
  const {
    tenantId,
    interactionId,
    source,
    metadata,
  } = JSON.parse(event.Records[0].body);
  const logContext = {
    tenantId,
    interactionId,
  };

  log.info('Updating interaction metadata', { ...logContext, source, metadata });

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
        source,
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

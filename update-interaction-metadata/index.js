const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const { v1: uuidv1 } = require('uuid');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();

const { REGION_PREFIX, ENVIRONMENT, DOMAIN } = process.env;

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
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-cx`,
    }).promise();
  } catch (error) {
    log.error('An Error has occurred trying to retrieve cx credentials', logContext, error);

    throw error;
  }

  const auth = JSON.parse(cxAuthSecret.SecretString);

  try {
    const { data } = await axios({
      method: 'post',
      url: `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/metadata?id=${uuidv1()}`,
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

const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const uuidv1 = require('uuid/v1');
const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;

exports.handler = async (event) => {
  const {
    tenantId,
    interactionId,
  } = JSON.parse(event.Records[0].body);
  const logContext = {
    tenantId,
    interactionId,
  };

  log.info('Ending the interaction', logContext);

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
      url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/interrupts?id=${uuidv1()}`,
      data: {
        source: 'smooch',
        interruptType: 'customer-disconnect',
        interrupt: {},
      },
      auth,
    });
    log.info('Interaction ended', { ...logContext, data });
  } catch (error) {
    log.error('Error ending the interaction', logContext, error);
    throw error;
  }
};

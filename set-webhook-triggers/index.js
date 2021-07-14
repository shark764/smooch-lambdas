const { lambda: { log } } = require('alonzo');
const AWS = require('aws-sdk');

/* Using old sdk as our webhooks were created with v1.1.
Should be replaced with new sdk when apps are migrated to v2 */
const SmoochCore = require('smooch-core');

const secretsClient = new AWS.SecretsManager();
const docClient = new AWS.DynamoDB.DocumentClient();

const {
  REGION_PREFIX,
  ENVIRONMENT,
  SMOOCH_API_URL,
} = process.env;

exports.handler = async () => {
  log.info('Set webhook triggers was called');
  const accountSecrets = await secretsClient.getSecretValue({
    SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-account`,
  }).promise();
  const accountKeys = JSON.parse(accountSecrets.SecretString);
  const smooch = new SmoochCore({
    keyId: accountKeys.id,
    secret: accountKeys.secret,
    scope: 'account',
    serviceUrl: SMOOCH_API_URL,
  });

  const getRecordsParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
  };

  let smoochApps;

  try {
    const { Items } = await docClient.scan(getRecordsParams).promise();
    smoochApps = Items.filter((record) => record.type === 'app');
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch apps in DynamoDB';

    log.error(errMsg, {}, error);

    throw error;
  }

  log.debug('Starting webhook trigger update', { smoochApps });

  let hasErrored = false;
  for (const smoochApp of smoochApps) {
    const logContext = { smoochApp };
    const { id: appId, 'webhook-id': webhookId } = smoochApp;
    try {
      await smooch.webhooks.update(appId, webhookId,
        { triggers: ['message:appUser', 'conversation:read', 'typing:appUser', 'message:delivery:failure', 'postback'] });
    } catch (error) {
      log.error('An error occurred updating smooch app webhook', logContext, error);
      hasErrored = true;
    }
  }

  if (hasErrored) {
    throw new Error('At least one of the apps was unable to update. See logs for details.');
  }
};

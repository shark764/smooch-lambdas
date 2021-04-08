/* eslint-disable no-console */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');

AWS.config.update({ region: 'us-east-1' });

const secretsClient = new AWS.SecretsManager();

const SMOOCH_API_URL = 'https://api.smooch.io';

(async () => {
  const accountSecrets = await secretsClient.getSecretValue({
    SecretId: 'us-east-1-dev-smooch-account',
  }).promise();

  const accountKeys = JSON.parse(accountSecrets.SecretString);
  const smooch = new SmoochCore({
    keyId: accountKeys.id,
    secret: accountKeys.secret,
    scope: 'account',
    serviceUrl: SMOOCH_API_URL,
  });

  let allSmoochApps = [];
  const limit = 100;
  let hasMoreApps = true;
  for (let i = 0; hasMoreApps === true; i += limit) {
    const { apps, hasMore } = await smooch.apps.list({ limit, offset: i });
    allSmoochApps = allSmoochApps.concat(apps);
    hasMoreApps = hasMore;
  }
  console.log('Total number of apps from smooch (in this service account):\n', allSmoochApps.length);
  console.log(allSmoochApps);
})().catch((e) => {
  console.error('Unexpected error', e);
});

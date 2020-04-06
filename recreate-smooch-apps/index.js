
/* Lambda that recreates current Smooch apps */

const log = require('serenova-js-utils/lambda/log');
const AWS = require('aws-sdk');
const SmoochCore = require('smooch-core');


AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();
const {
  AWS_REGION,
  ENVIRONMENT,
  DOMAIN,
  smooch_api_url: smoochApiUrl,
} = process.env;

const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async () => {
  const getRecordsParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
  };

  let smoochRecords;
  let smoochApps;
  let smoochIntegrations;
  try {
    const queryResponse = await docClient.scan(getRecordsParams).promise();
    smoochRecords = queryResponse.Items;
    smoochApps = smoochRecords.filter((record) => record.type === 'app');
    smoochIntegrations = smoochRecords.filter((record) => record.type === 'web');
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch apps in DynamoDB';

    log.error(errMsg, {}, error);

    throw error;
  }

  let accountSecrets;
  try {
    accountSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-account`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred retrieving account secrets';

    log.error(errMsg, {}, error);

    throw error;
  }

  const accountKeys = JSON.parse(accountSecrets.SecretString);
  const smooch = new SmoochCore({
    keyId: accountKeys.id,
    secret: accountKeys.secret,
    scope: 'account',
    serviceUrl: smoochApiUrl,
  });

  let failed = false;

  for (const smoochAppRecord of smoochApps) {
    const { 'tenant-id': tenantId, id: appId } = smoochAppRecord;
    const webIntegrationRecords = smoochIntegrations.filter((webIntegration) => webIntegration['app-id'] === appId);
    const logContext = { tenantId, appId };

    let smoochApp;
    try {
      const { app } = await smooch.apps.get(appId);
      smoochApp = app;
    } catch (error) {
      log.error('Error retrieving current Smooch app', logContext, error);
      failed = true;
    }

    if (smoochApp) {
      let newApp;
      try {
        // Recreate the app.
        newApp = await createSmoochApp(tenantId, smoochApp, smoochAppRecord, smooch);
      } catch (error) {
        log.error('Error creating Smooch App', logContext, error);
        failed = true;
      }
      if (newApp) {
        if (webIntegrationRecords.length > 0) {
          for (const webIntegrationRecord of webIntegrationRecords) {
            // get the old integration then delete an recreate it.
            let smoochIntegration;
            try {
              smoochIntegration = await smooch.integrations
                .get({ appId, integrationId: webIntegrationRecord.id });
            } catch (error) {
              log.error('Error retrieving Smooch integration', { ...logContext, integrationId: webIntegrationRecord.id }, error);
              failed = true;
            }
            if (smoochIntegration) {
              try {
                await deleteSmoochWebIntegration(tenantId, appId, webIntegrationRecord.id, smooch);
              } catch (error) {
                log.error('Error deleting Smooch integration', { ...logContext, integrationId: webIntegrationRecord.id }, error);
                failed = true;
              }
              try {
                await createSmoochWebIntegration(tenantId, newApp._id,
                  smoochIntegration.integration,
                  webIntegrationRecord, smooch);
              } catch (error) {
                log.error('Error creating Smooch integration', logContext, error);
                failed = true;
              }
            }
          }
        }
        // delete old smooch app
        try {
          await deleteSmoochApp(tenantId, appId, smooch);
        } catch (error) {
          log.error('Error deleting smooch app', logContext, error);
        }
      }
    }
  }

  if (failed) throw new Error('Something failed running recreate-smooch-apps');
};

/**
 * Delete a Smooch App
 * @param {String} tenantId - Tenant ID.
 * @param {String} appId - Smooch App ID to delete.
 * @param {Object} smooch - Smooch SDK.
 */
async function deleteSmoochApp(tenantId, appId, smooch) {
  const logContext = { tenantId, appId };
  const deleteParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    Key: {
      'tenant-id': tenantId,
      id: appId,
    },
  };

  try {
    await docClient.delete(deleteParams).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete a record in DynamoDB';

    log.error(errMsg, logContext, error);

    throw error;
  }

  try {
    await smooch.apps.delete(appId);
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete an app';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const appSecretName = `${AWS_REGION}-${ENVIRONMENT}-smooch-app`;
  try {
    const appSecrets = await secretsClient.getSecretValue({
      SecretId: appSecretName,
    }).promise();

    const appKeys = JSON.parse(appSecrets.SecretString);

    if (appKeys[`${appId}-id`]) {
      delete appKeys[`${appId}-id`];
      delete appKeys[`${appId}-id-old`];
      if (appKeys[`${appId}-secret-old`]) delete appKeys[`${appId}-secret-old`];
      if (appKeys[`${appId}-secret`]) delete appKeys[`${appId}-secret`];

      await secretsClient.putSecretValue({
        SecretId: appSecretName,
        SecretString: JSON.stringify(appKeys),
      }).promise();
    }
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete app keys';

    log.error(errMsg, logContext, error);

    throw error;
  }
}

/**
 * Create a new Smooch App
 * @param {String} tenantId - Tenant ID.
 * @param {Object} smoochBody - new app body
 * @param {Object} dynamoItem - DynamoDB new record body.
 * @param {Object} smooch - Smooch SDK.
 */
async function createSmoochApp(tenantId, smoochBody, dynamoItem, smooch) {
  const logContext = { tenantId, appId: smoochBody._id };
  let newApp;
  try {
    newApp = await smooch.apps.create(smoochBody);
    newApp = newApp.app;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create an App';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const newAppId = newApp._id;
  let smoochAppKeys;

  logContext.smoochAppId = newAppId;

  try {
    smoochAppKeys = await smooch.apps.keys.create(newAppId, newAppId);
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create App credentials';

    log.error(errMsg, logContext, error);

    throw error;
  }

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred (1) trying to save App credentials';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const appKeys = JSON.parse(appSecrets.SecretString);
  appKeys[`${newAppId}-id`] = smoochAppKeys.key._id;
  appKeys[`${newAppId}-secret`] = smoochAppKeys.key.secret;

  try {
    await secretsClient.putSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
      SecretString: JSON.stringify(appKeys),
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred (2) trying to save App credentials';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const webhookUrl = `https://${AWS_REGION}-${ENVIRONMENT}-smooch-gateway.${DOMAIN}/webhook?tenantId=${tenantId}`;
  let webhook;
  try {
    webhook = await smooch.webhooks.create(newAppId, { target: webhookUrl, triggers: ['message:appUser', 'conversation:read', 'typing:appUser'], includeClient: true });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create webhooks';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const smoochParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    Item: {
      'tenant-id': tenantId,
      id: newAppId,
      name: smoochBody.name,
      type: 'app',
      'webhook-id': webhook.webhook._id,
      'created-by': dynamoItem['created-by'],
      'updated-by': dynamoItem['updated-by'],
      created: (new Date()).toISOString(),
      updated: (new Date()).toISOString(),
    },
  };

  try {
    await docClient.put(smoochParams).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to save a record in DynamoDB';

    log.error(errMsg, logContext, error);

    throw error;
  }

  return newApp;
}

/**
 * Delete a Smooch web Integration
 * @param {String} tenantId - Tenant ID.
 * @param {String} appId - Smooch App ID.
 * @param {String} integrationId - Smooch Integration ID.
 * @param {Object} smooch - Smooch SDK
 */
async function deleteSmoochWebIntegration(tenantId, appId, integrationId, smooch) {
  const logContext = { tenantId, appId, integrationId };
  try {
    await smooch.integrations.delete({ appId, integrationId });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete an web integration';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const deleteParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    Key: {
      'tenant-id': tenantId,
      id: integrationId,
    },
  };

  log.debug('Deleting record in DynamoDB', { ...logContext, deleteParams });
  try {
    await docClient.delete(deleteParams).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete a record in DynamoDB';

    log.error(errMsg, logContext, error);

    throw error;
  }
}

/**
 * Create a new Web Integration
 * @param {String} tenantId - Tenant ID
 * @param {String} appId - appId related to web integration.
 * @param {Object} smoochBody - body of web integration.
 * @param {Object} dynamoItem - DynamoDB Item data.
 * @param {Object} smooch - Smooch SDK.
 */
async function createSmoochWebIntegration(tenantId, appId, smoochBody, dynamoItem, smooch) {
  const logContext = { tenantId, appId };
  let smoochIntegration;
  try {
    const { integration } = await smooch.integrations.create(appId, smoochBody);

    smoochIntegration = integration;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create a web integration for tenant';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const {
    name,
    'contact-point': contactPoint,
    description,
    'client-disconnect-minutes': clientDisconnectMinutes,
  } = dynamoItem;

  let updateExpression = `set #type = :t, #appId = :appId, #contactPoint = :contactPoint,
  #name = :name, #createdBy = :createdBy, #updatedBy = :updatedBy,
  created = :created, updated = :updated`;

  const expressionAttributeNames = {
    '#type': 'type',
    '#appId': 'app-id',
    '#contactPoint': 'contact-point',
    '#createdBy': 'created-by',
    '#updatedBy': 'updated-by',
    '#name': 'name',
  };

  const expressionAttributeValues = {
    ':t': 'web',
    ':appId': appId,
    ':contactPoint': contactPoint,
    ':name': name,
    ':createdBy': dynamoItem['created-by'],
    ':updatedBy': dynamoItem['updated-by'],
    ':created': (new Date()).toISOString(),
    ':updated': (new Date()).toISOString(),
  };

  if (description) {
    updateExpression += ', description = :description';
    expressionAttributeValues[':description'] = description;
  }

  if (clientDisconnectMinutes) {
    updateExpression += ', #clientDisconnectMinutes = :clientDisconnectMinutes';
    expressionAttributeNames['#clientDisconnectMinutes'] = 'client-disconnect-minutes';
    expressionAttributeValues[':clientDisconnectMinutes'] = clientDisconnectMinutes;
  }

  const updateParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    Key: { 'tenant-id': tenantId, id: smoochIntegration._id },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  };

  log.debug('Creating record in DynamoDB', { ...logContext, updateParams });
  try {
    await docClient.update(updateParams).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to save a record in DynamoDB for tenant';

    log.error(errMsg, logContext, error);

    throw error;
  }

  return smoochIntegration;
}

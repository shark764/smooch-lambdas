/**
 * Lambda that creates a whatsapp integration
 */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const Joi = require('joi');
const string = require('serenova-js-utils/strings');

const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

const {
  lambda: {
    log,
    api: { validateTenantPermissions },
  },
} = require('alonzo');

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

const bodySchema = Joi.object({
  whatsappId: Joi.string().required(),
  name: Joi.string().trim().min(1).required(),
  description: Joi.string().allow(''),
  clientDisconnectMinutes: Joi.number().min(1).max(1440).allow(null),
  active: Joi.boolean().strict().valid(true, false),
});

const { REGION_PREFIX, ENVIRONMENT, SMOOCH_API_URL } = process.env;
const lambdaPermissions = ['WHATSAPP_INTEGRATIONS_APP_UPDATE'];

exports.handler = async (event) => {
  const { body, params, identity } = event;
  const { 'tenant-id': tenantId } = params;
  const logContext = {
    tenantId,
    smoochUserId: identity['user-id'],
  };

  log.info('create-whatsapp-integration was called', {
    ...logContext,
    params,
    SMOOCH_API_URL,
  });

  /**
   * Validating permissions
   */
  const validPermissions = validateTenantPermissions(
    tenantId,
    identity,
    lambdaPermissions,
  );

  if (!validPermissions) {
    const expectedPermissions = {
      tenant: lambdaPermissions,
    };
    const errMsg = 'Error not enough permissions';
    log.warn(errMsg, logContext, expectedPermissions);

    return {
      status: 403,
      body: { message: errMsg, expectedPermissions },
    };
  }

  /**
   * Validating parameters
   */
  try {
    await paramsSchema.validateAsync(params, { abortEarly: false });
  } catch (error) {
    const errMsg = 'Error: invalid params value(s).';
    const validationMessage = error.details
      .map(({ message }) => message)
      .join(' / ');

    log.warn(errMsg, { ...logContext, validationMessage }, error);

    return {
      status: 400,
      body: {
        message: `${errMsg} ${validationMessage}`,
        error,
      },
    };
  }

  /**
   * Validating body
   */
  try {
    await bodySchema.validateAsync(body, { abortEarly: false });
  } catch (error) {
    const errMsg = 'Error: invalid body value(s).';
    const validationMessage = error.details
      .map(({ message }) => message)
      .join(' / ');

    log.warn(errMsg, { ...logContext, validationMessage }, error);

    return {
      status: 400,
      body: { message: `${errMsg} ${validationMessage}` },
    };
  }

  /**
   * There should be no record in dynamo table with passed app-id as key
   * whatsappId will become new record id
   */
  const { whatsappId: integrationId } = body;
  const getParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
    Key: {
      'tenant-id': tenantId,
      id: integrationId,
    },
  };
  try {
    const { Item } = await docClient.get(getParams).promise();
    /**
     * There can't be two records with the same id
     */
    if (Item) {
      let errMsg = 'A record already exists for this whatsappId in this tenant';

      if (Item.type !== 'whatsapp') {
        errMsg = 'Invalid body value, whatsappId provided is invalid for this request';
      }

      log.error(errMsg, logContext);

      return {
        status: 400,
        body: { message: errMsg, whatsappId: integrationId },
      };
    }
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch an app with passed whatsappId in DynamoDB';

    log.error(errMsg, logContext, error, getParams);

    return {
      status: 500,
      body: { message: errMsg, getParams },
    };
  }

  /**
   * Getting app secrets
   */
  let appSecrets;
  try {
    appSecrets = await secretsClient
      .getSecretValue({
        SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
      })
      .promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  /**
   * Getting apps records from dynamo
   */
  const queryParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
    KeyConditionExpression: '#tenantId = :t and #integrationType = :type',
    IndexName: 'tenant-id-type-index',
    ExpressionAttributeNames: {
      '#tenantId': 'tenant-id',
      '#integrationType': 'type',
    },
    ExpressionAttributeValues: {
      ':t': tenantId,
      ':type': 'app',
    },
  };

  let smoochAppDynamoRecords;
  try {
    const queryResponse = await docClient.query(queryParams).promise();
    smoochAppDynamoRecords = queryResponse.Items;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch apps in DynamoDB';

    log.error(errMsg, logContext, error, queryParams);

    return {
      status: 500,
      body: { message: errMsg, queryParams },
    };
  }

  /**
   * Getting apps (type: "whatsapp") from smooch
   * for each app found in dynamo
   */
  let smoochApps;
  try {
    smoochApps = await Promise.all(
      smoochAppDynamoRecords.map(({ id: appId }) => {
        const appKeys = JSON.parse(appSecrets.SecretString);
        const smooch = new SmoochCore({
          keyId: appKeys[`${appId}-id`],
          secret: appKeys[`${appId}-secret`],
          scope: 'app',
          serviceUrl: SMOOCH_API_URL,
        });

        return smooch.integrations.list({
          appId,
          types: 'whatsapp',
        });
      }),
    );
  } catch (error) {
    const errMsg = 'An error occured trying to retrieve whatsapp integrations';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  /**
   * Getting integrations from every smooch app
   */
  const integrations = smoochApps.reduce(
    (appIntegrations, smoochApp, index) => [
      ...appIntegrations,
      ...smoochApp.integrations.map(({ _id, ...integration }) => ({
        ...integration,
        id: _id,
        appId: smoochAppDynamoRecords[index].id,
      })),
    ],
    [],
  );

  const {
    whatsappId,
    name,
    description,
    clientDisconnectMinutes,
    active = true,
  } = body;

  /**
   * Getting smooch integration that corresponds to whatsappId passed
   */
  const whatsappIntegration = integrations.find(
    (integration) => integration.id === whatsappId,
  );
  if (!whatsappIntegration) {
    const errMsg = 'The whatsappId provided in the request body does not exist in smooch for this tenant';
    return {
      status: 400,
      body: { message: errMsg },
    };
  }

  /**
   * Preparing query to insert a new record
   */
  let updateExpression = `set #type = :t, #appId = :appId, #name = :name,
  #active = :active, #createdBy = :createdBy, #updatedBy = :updatedBy,
  created = :created, updated = :updated`;
  const expressionAttributeNames = {
    '#appId': 'app-id',
    '#type': 'type',
    '#name': 'name',
    '#active': 'active',
    '#createdBy': 'created-by',
    '#updatedBy': 'updated-by',
  };
  const expressionAttributeValues = {
    ':t': 'whatsapp',
    ':appId': whatsappIntegration.appId,
    ':name': name,
    ':active': active,
    ':createdBy': identity['user-id'],
    ':updatedBy': identity['user-id'],
    ':created': new Date().toISOString(),
    ':updated': new Date().toISOString(),
  };

  if (description !== undefined) {
    updateExpression += ', description = :description';
    expressionAttributeValues[':description'] = description;
  }
  if (clientDisconnectMinutes !== undefined) {
    updateExpression += ', #cdm = :cdm';
    expressionAttributeNames['#cdm'] = 'client-disconnect-minutes';
    expressionAttributeValues[':cdm'] = clientDisconnectMinutes;
  }

  const updateParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
    Key: {
      'tenant-id': tenantId,
      id: whatsappId,
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  };

  /**
   * Creating record in dynamo table
   */
  let dynamoValue;
  log.debug('Creating record in DynamoDB', { ...logContext, updateParams });
  try {
    const { Attributes } = await docClient.update(updateParams).promise();
    dynamoValue = Attributes;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to save a record in DynamoDB for tenant';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg, error },
    };
  }

  const result = string.keysToCamelCase(dynamoValue);

  log.info('User created a new whatsapp integration', {
    userId: identity['user-id'],
    tenantId,
    whatsappId,
    auditData: Object.keys(body),
    audit: true,
  });
  log.info('create-whatsapp-integration complete', { ...logContext, result });

  return {
    status: 201,
    body: { result },
  };
};

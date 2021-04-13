const SunshineConversationsClient = require('sunshine-conversations-client');
const AWS = require('aws-sdk');
const Joi = require('joi');
const axios = require('axios');
const string = require('serenova-js-utils/strings');
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
  appId: Joi.string().required(),
  facebookAppId: Joi.string().required(),
  facebookAppSecret: Joi.string().required(),
  facebookPageId: Joi.string().required(),
  facebookUserAccessToken: Joi.string(),
  facebookPageAccessToken: Joi.string(),
  name: Joi.string().trim().min(1).required(),
  description: Joi.string().allow(''),
  clientDisconnectMinutes: Joi.number().min(1).max(1440).allow(null),
});

const {
  REGION_PREFIX,
  ENVIRONMENT,
  SMOOCH_API_URL,
} = process.env;

const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const lambdaPermissions = ['FACEBOOK_INTEGRATIONS_APP_UPDATE'];

exports.handler = async (event) => {
  const { body, params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], body };

  log.info('create-facebook-integration was called', { ...logContext, params, SMOOCH_API_URL });

  /**
   * Validating permissions
   */

  const { 'tenant-id': tenantId } = params;
  const validPermissions = validateTenantPermissions(tenantId, identity, lambdaPermissions);
  const expectedPermissions = {
    tenant: lambdaPermissions,
  };
  if (!validPermissions) {
    const errMsg = 'Error not enough permissions';

    log.warn(errMsg, { ...logContext, expectedPermissions });

    return {
      status: 400,
      body: { message: errMsg, expectedPermissions },
    };
  }

  /**
   * Validating parameters
   */

  try {
    await bodySchema.validateAsync(body);
  } catch (error) {
    const errMsg = 'Error: invalid body value(s).';
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

  try {
    await paramsSchema.validateAsync(params);
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
   * Getting apps keys from secret manager
   */

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const { appId } = body;
  const defaultClient = SunshineConversationsClient.ApiClient.instance;
  try {
    const appKeys = JSON.parse(appSecrets.SecretString);
    const { basicAuth } = defaultClient.authentications;
    basicAuth.username = appKeys[`${appId}-id`];
    basicAuth.password = appKeys[`${appId}-secret`];
  } catch (error) {
    const errMsg = 'Failed to parse smooch credentials or credentials does not exists';
    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const {
    facebookAppId,
    facebookAppSecret,
    facebookUserAccessToken,
    facebookPageAccessToken,
    facebookPageId,
    name,
    description,
    clientDisconnectMinutes,
  } = body;

  let pageAccessToken;
  if (!facebookPageAccessToken && !facebookUserAccessToken) {
    log.error('Page Access Token and User Access Token missing', logContext);
    return {
      status: 400,
      body: {
        error: 'Page Access Token and User Access Token missing, Please provide any one of the token',
      },
    };
  }

  if (facebookPageAccessToken) {
    pageAccessToken = facebookPageAccessToken;
  } else {
    /**
    * Fetch facebook Page Access Token
    */
    try {
      const { data } = await axios({
        method: 'get',
        url: `https://graph.facebook.com/${facebookPageId}?fields=access_token&access_token=${facebookUserAccessToken}`,
      });
      pageAccessToken = data.access_token;
    } catch (error) {
      log.error('Unexpected error occurred retrieving Page Access token', logContext, error);
      return {
        status: 500,
        body: {
          error: 'Unexpected error occurred retrieving Page Access token. Please try again with Facebook Login/Another user access token',
        },
      };
    }
  }

  /**
   * Getting app access token from facebook
   */

  let appAccessToken;
  try {
    const { data } = await axios({
      method: 'get',
      url: `https://graph.facebook.com/oauth/access_token?client_id=${facebookAppId}&client_secret=${facebookAppSecret}&grant_type=client_credentials`,
    });
    appAccessToken = data.access_token;
  } catch (error) {
    log.error('Unexpected error occurred retrieving App Access token', logContext, error);
    return {
      status: 500,
      body: {
        error: 'Unexpected error occurred retrieving App Access token.',
      },
    };
  }

  /**
   * Deleting current page subscription
   */

  try {
    await axios({
      method: 'delete',
      url: `https://graph.facebook.com/v10.0/${facebookAppId}/subscriptions?object=page`,
      headers: {
        Authorization: `Bearer ${appAccessToken}`,
      },
    });
  } catch (error) {
    log.error('Unexpected error occurred deleting current page subscription', logContext, error);
    return {
      status: 500,
      body: {
        error: 'Unexpected error occurred deleting current page subscription.',
      },
    };
  }

  /**
   * Create Facebook integration
   */

  const apiInstance = new SunshineConversationsClient.IntegrationsApi();
  const integrationInstance = new SunshineConversationsClient.Integration();
  let facebookIntegration;
  try {
    integrationInstance.type = 'messenger';
    integrationInstance.pageAccessToken = pageAccessToken;
    integrationInstance.appId = facebookAppId;
    integrationInstance.appSecret = facebookAppSecret;
    const { integration } = await apiInstance.createIntegration(appId, integrationInstance);
    facebookIntegration = integration;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create a facebook integration for tenant';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg, error },
    };
  }

  /**
   * Preparing query to insert a new record
   */
  let updateExpression = `set #type = :t, #appId = :appId, #name = :name, #createdBy = :createdBy, #updatedBy = :updatedBy,
  created = :created, updated = :updated`;
  const expressionAttributeNames = {
    '#appId': 'app-id',
    '#type': 'type',
    '#name': 'name',
    '#createdBy': 'created-by',
    '#updatedBy': 'updated-by',
  };
  const expressionAttributeValues = {
    ':t': 'facebook',
    ':appId': appId,
    ':name': name,
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
      id: facebookIntegration.id,
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

  const dynamoValueCased = {};

  Object.keys(dynamoValue).forEach((v) => {
    dynamoValueCased[string.kebabCaseToCamelCase(v)] = dynamoValue[v];
  });

  delete facebookIntegration.displayName;
  const result = {
    ...facebookIntegration,
    ...dynamoValueCased,
  };

  log.info('User created a new facebook integration', {
    userId: identity['user-id'],
    tenantId,
    appId,
    facebookAppId,
    facebookPageId,
    auditData: Object.keys(body),
    audit: true,
  });

  log.info('create-facebook-integration complete', { ...logContext, result });

  return {
    status: 201,
    body: { result },
  };
};

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
  id: Joi.string(),
  auth: Joi.any(),
});

const bodySchema = Joi.object({
  appId: Joi.string().required(),
  facebookAppId: Joi.string().required(),
  facebookAppSecret: Joi.string(),
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
  const logContext = { tenantId: params['tenant-id'], userId: identity['user-id'], smoochIntegrationId: params.id };

  log.info('update-facebook-integration was called', { ...logContext, params, SMOOCH_API_URL });

  /**
   * Validating permissions
   */

  const { 'tenant-id': tenantId, id: integrationId } = params;
  const validPermissions = validateTenantPermissions(tenantId, identity, lambdaPermissions);
  const expectedPermissions = {
    tenant: lambdaPermissions,
  };
  if (!validPermissions) {
    const errMsg = 'Error not enough permissions';

    log.warn(errMsg, { ...logContext, expectedPermissions });

    return {
      status: 403,
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

  /**
    * Getting app keys from Secret Manager
    */

  let appKeys;
  try {
    appKeys = JSON.parse(appSecrets.SecretString);
  } catch (error) {
    const errMsg = 'Failed to parse smooch credentials or credentials does not exists';
    log.error(errMsg, logContext, error);
    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const {
    appId,
    facebookAppId,
    facebookAppSecret,
    facebookUserAccessToken,
    facebookPageAccessToken,
    facebookPageId,
    name,
    description,
    clientDisconnectMinutes,
  } = body;

  if (facebookAppSecret || facebookPageAccessToken) {
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
        * Fetch Long lived user access token
        */
      let longLivedUserAccessToken;
      try {
        const { data } = await axios({
          method: 'get',
          url: `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${facebookAppId}&client_secret=${facebookAppSecret}&fb_exchange_token=${facebookUserAccessToken}`,
        });
        longLivedUserAccessToken = data.access_token;
      } catch (error) {
        log.error('Unexpected error occurred retrieving Long Lived User Access token', logContext, error);
        return {
          status: 500,
          body: {
            error: 'Unexpected error occurred retrieving Page Access token. Please try again with Facebook Login/Another user access token',
          },
        };
      }

      /**
      * Fetch facebook Page Access Token
      */
      try {
        const { data } = await axios({
          method: 'get',
          url: `https://graph.facebook.com/${facebookPageId}?fields=access_token&access_token=${longLivedUserAccessToken}`,
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
     * Updating Facebook integration
     */
    const defaultClient = SunshineConversationsClient.ApiClient.instance;
    const { basicAuth } = defaultClient.authentications;
    basicAuth.username = appKeys[`${appId}-id`];
    basicAuth.password = appKeys[`${appId}-secret`];
    const apiInstance = new SunshineConversationsClient.IntegrationsApi();
    const integrationUpdate = new SunshineConversationsClient.IntegrationUpdate();
    integrationUpdate.pageAccessToken = pageAccessToken;
    try {
      await apiInstance.updateIntegration(appId, integrationId, integrationUpdate);
    } catch (error) {
      const errMsg = 'An Error has occurred trying to update facebook integration for tenant';

      log.error(errMsg, logContext, error);

      return {
        status: 500,
        body: { message: errMsg, error },
      };
    }
  }

  let facebookIntegration;
  /**
  * Fetch facebook Integration
  */
  try {
    const { data } = await axios({
      method: 'get',
      url: `https://api.smooch.io/v2/apps/${appId}/integrations/${integrationId}`,
      auth: {
        username: appKeys[`${appId}-id`],
        password: appKeys[`${appId}-secret`],
      },
    });
    facebookIntegration = data.integration;
  } catch (error) {
    log.error('Unexpected error occurred getting integration from smooch', logContext, error);
    return {
      status: 500,
      body: {
        error: 'Unexpected error occurred getting integration from smooch',
      },
    };
  }

  /**
   * Preparing query to update record
   */
  let updateExpression = 'set #name = :name, #updatedBy = :updatedBy, updated = :updated';
  const expressionAttributeNames = {
    '#updatedBy': 'updated-by',
    '#name': 'name',
  };
  const expressionAttributeValues = {
    ':name': name,
    ':updatedBy': identity['user-id'],
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
      id: integrationId,
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  };

  /**
   * Updating record in dynamo table
   */
  let dynamoValue;
  log.debug('Updating record in DynamoDB', { ...logContext, updateParams });
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

  facebookIntegration.facebookAppId = facebookIntegration.appId;
  facebookIntegration.facebookPageId = facebookIntegration.pageId;
  delete facebookIntegration.appId;
  delete facebookIntegration.pageId;
  delete facebookIntegration.displayName;
  const result = {
    ...facebookIntegration,
    ...dynamoValueCased,
  };

  log.info('User updated facebook integration', {
    userId: identity['user-id'],
    tenantId,
    appId,
    facebookAppId,
    facebookPageId,
    auditData: Object.keys(body),
    audit: true,
  });

  log.info('update facebook integration complete', { ...logContext, result });

  return {
    status: 200,
    body: { result },
  };
};

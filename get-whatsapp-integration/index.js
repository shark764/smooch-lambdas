const AWS = require('aws-sdk');
const Joi = require('joi');
const string = require('serenova-js-utils/strings');
const {
  lambda: {
    log,
    api: { validateTenantPermissions, validatePlatformPermissions },
  },
} = require('alonzo');

const docClient = new AWS.DynamoDB.DocumentClient();

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid().required(),
  id: Joi.string().required(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

const { REGION_PREFIX, ENVIRONMENT } = process.env;
const lambdaPermissions = ['WHATSAPP_INTEGRATIONS_APP_READ'];
const lambdaPlatformPermissions = ['PLATFORM_VIEW_ALL'];

exports.handler = async (event) => {
  const { params, identity } = event;

  const { 'tenant-id': tenantId, id: integrationId } = params;
  const logContext = {
    tenantId,
    smoochUserId: identity['user-id'],
    integrationId,
  };

  log.info('get-whatsapp-integration was called', {
    ...logContext,
    params,
  });

  /**
   * Validating permissions
   */
  const validPermissions = validateTenantPermissions(
    tenantId,
    identity,
    lambdaPermissions,
  );
  const validPlatformPermissions = validatePlatformPermissions(
    identity,
    lambdaPlatformPermissions,
  );

  if (!(validPermissions || validPlatformPermissions)) {
    const expectedPermissions = {
      tenant: lambdaPermissions,
      platform: lambdaPlatformPermissions,
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
   * Getting app record from dynamo
   */
  const queryParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
    Key: {
      'tenant-id': tenantId,
      id: integrationId,
    },
  };

  let integration;
  try {
    const { Item } = await docClient.get(queryParams).promise();
    /**
     * No record is found, we throw an error
     */
    if (Item) {
      integration = Item;

      if (Item.type !== 'whatsapp') {
        const errMsg = 'Invalid parameter value, whatsappId provided is invalid for this request';

        log.error(errMsg, logContext);

        return {
          status: 400,
          body: { message: errMsg, whatsappId: integrationId },
        };
      }
    } else {
      const errMsg = 'The app does not exist for this tenant';

      log.error(errMsg, logContext);

      return {
        status: 404,
        body: { message: errMsg },
      };
    }
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch an app in DynamoDB';

    log.error(errMsg, logContext, error, queryParams);

    return {
      status: 500,
      body: { message: errMsg, queryParams },
    };
  }

  const result = string.keysToCamelCase(integration);

  log.info('get-whatsapp-integration complete', {
    ...logContext,
    integration: result,
  });

  return {
    status: 200,
    body: {
      result,
    },
  };
};

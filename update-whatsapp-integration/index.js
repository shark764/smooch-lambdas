const AWS = require('aws-sdk');
const Joi = require('joi');
const string = require('serenova-js-utils/strings');
const {
  lambda: {
    log,
    api: { validateTenantPermissions },
  },
} = require('alonzo');

const docClient = new AWS.DynamoDB.DocumentClient();

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  id: Joi.string(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

const bodySchema = Joi.object({
  appId: Joi.string(),
  name: Joi.string().trim().min(1),
  description: Joi.string().allow(''),
  clientDisconnectMinutes: Joi.number().min(1).max(1440).allow(null),
  active: Joi.boolean().strict().valid(true, false),
});

const { REGION_PREFIX, ENVIRONMENT } = process.env;
const lambdaPermissions = ['WHATSAPP_INTEGRATIONS_APP_UPDATE'];

exports.handler = async (event) => {
  const { body, params, identity } = event;
  const { 'tenant-id': tenantId, id: integrationId } = params;
  const logContext = {
    tenantId,
    integrationId,
    userId: identity['user-id'],
  };

  log.info('update-whatsapp-integration was called', {
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

  if (!validPermissions) {
    const expectedPermissions = {
      tenant: lambdaPermissions,
    };
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
   * Checking if there exists a record with key === param.id
   */
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
     * If no record is found, we throw an error
     */
    if (!Item) {
      const errMsg = 'The app does not exist for this tenant';

      log.error(errMsg, logContext);

      return {
        status: 404,
        body: { message: errMsg, whatsappId: integrationId },
      };
    }
    if (Item.type !== 'whatsapp') {
      const errMsg = 'Invalid parameter value, whatsappId provided is invalid for this request';

      log.error(errMsg, logContext);

      return {
        status: 400,
        body: { message: errMsg, whatsappId: integrationId },
      };
    }
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch an app with passed id in DynamoDB';

    log.error(errMsg, { ...logContext, getParams }, error);

    return {
      status: 500,
      body: { message: errMsg, getParams },
    };
  }

  const {
    name, description, clientDisconnectMinutes, active,
  } = body;
  /**
   * Preparing query to update a record
   */
  let updateExpression = `set
    #updatedBy = :updatedBy,
    updated = :updated`;

  const expressionAttributeNames = {
    '#updatedBy': 'updated-by',
  };

  const expressionAttributeValues = {
    ':updatedBy': identity['user-id'],
    ':updated': new Date().toISOString(),
  };

  let hasExpectedProperty = false;
  if (name) {
    updateExpression += ', #name = :name';
    expressionAttributeNames['#name'] = 'name';
    expressionAttributeValues[':name'] = name;
    hasExpectedProperty = true;
  }
  if (description !== undefined) {
    updateExpression += ', description = :description';
    expressionAttributeValues[':description'] = description;
    hasExpectedProperty = true;
  }
  /**
   * We need to allow null for "clientDisconnectMinutes"
   */
  if (clientDisconnectMinutes !== undefined) {
    updateExpression += ', #cdm = :cdm';
    expressionAttributeNames['#cdm'] = 'client-disconnect-minutes';
    expressionAttributeValues[':cdm'] = clientDisconnectMinutes;
    hasExpectedProperty = true;
  }

  if (active !== undefined) {
    updateExpression += ', #active = :active';
    expressionAttributeNames['#active'] = 'active';
    expressionAttributeValues[':active'] = active;
    hasExpectedProperty = true;
  }

  if (!hasExpectedProperty) {
    const errMsg = 'At least one of attributes "name"|"description"|"clientDisconnectMinutes"|"active" was expected but non of them was specified';

    log.error(errMsg, logContext);

    return {
      status: 400,
      body: { message: errMsg },
    };
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

  const result = string.keysToCamelCase(dynamoValue);

  log.info('User updated a whatsapp integration', {
    userId: identity['user-id'],
    tenantId,
    integrationId,
    auditData: Object.keys(body),
    audit: true,
  });
  log.info('update-whatsapp-integration complete', { ...logContext, result });

  return {
    status: 201,
    body: { result },
  };
};

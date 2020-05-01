/**
 * Lambda that updates a smooch integration
 * */

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const SmoochCore = require('smooch-core');
const log = require('serenova-js-utils/lambda/log');
const string = require('serenova-js-utils/strings');
const { validateTenantPermissions } = require('serenova-js-utils/lambda/api');

AWS.config.update({ region: process.env.AWS_REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const bodySchema = Joi.object({
  name: Joi.string(),
  prechatCapture: Joi.string()
    .required()
    .valid('name', 'email'),
  contactPoint: Joi.string(),
  description: Joi.string().allow(''),
  clientDisconnectMinutes: Joi.number().min(1).max(1440).allow(null),
  brandColor: Joi.string(),
  whitelistedUrls: Joi.array()
    .items(Joi.string()),
  businessName: Joi.string(),
  businessIconUrl: Joi.string(),
  fixedIntroPane: Joi.boolean(),
  conversationColor: Joi.string(),
  backgroundImageUrl: Joi.string(),
  actionColor: Joi.string(),
  displayStyle: Joi.string()
    .valid('button', 'tab'),
  buttonWidth: Joi.string(),
  buttonHeight: Joi.string(),
  buttonIconUrl: Joi.string(),
  appId: Joi.string(),
});
const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  id: Joi.string(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});
const lambdaPermissions = ['WEB_INTEGRATIONS_APP_UPDATE'];

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT, smooch_api_url: smoochApiUrl } = process.env;
  const { body, params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'], smoochIntegrationId: params.id };

  log.info('update-smooch-web-integration was called', { ...logContext, params, smoochApiUrl });

  try {
    await bodySchema.validateAsync(body);
  } catch (error) {
    log.warn('Error: invalid body value', { ...logContext, validationMessage: error.details[0].message }, error);

    return {
      status: 400,
      body: { message: `Error: invalid body value ${error.details[0].message}` },
    };
  }

  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    log.warn('Error: invalid params value', { ...logContext, validationMessage: error.details[0].message }, error);

    return {
      status: 400,
      body: { message: `Error: invalid params value ${error.details[0].message}` },
    };
  }

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const { 'tenant-id': tenantId, id: integrationId } = params;
  const validPermissions = validateTenantPermissions(tenantId, identity, lambdaPermissions);

  if (!validPermissions) {
    const errMsg = 'Error not enough permissions';

    log.warn(errMsg, logContext);

    return {
      status: 400,
      body: { message: errMsg },
    };
  }
  const queryParams = {
    Key: {
      'tenant-id': tenantId,
      id: integrationId,
    },
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
  };
  let appId;

  try {
    const queryResponse = await docClient.get(queryParams).promise();
    if (queryResponse.Item) {
      appId = queryResponse.Item['app-id'];
    } else {
      const errMsg = 'The app does not exist for this tenant';

      log.error(errMsg, logContext);

      return {
        status: 400,
        body: { message: errMsg },
      };
    }
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch an app in DynamoDB';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  let smooch;
  try {
    const appKeys = JSON.parse(appSecrets.SecretString);
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
      serviceUrl: smoochApiUrl,
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to validate digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  let defaultPrechatCapture;

  if (body.prechatCapture === 'name') {
    defaultPrechatCapture = [{
      type: 'text',
      name: 'name',
      label: 'Name',
      placeholder: '',
      minSize: 1,
      maxSize: 128,
    }];
  } else {
    defaultPrechatCapture = [{
      type: 'email',
      name: 'email',
      label: 'Email',
      placeholder: '',
      minSize: 1,
      maxSize: 128,
    }];
  }

  let smoochIntegration;

  logContext.smoochAppId = appId;
  try {
    const { integration } = await smooch.integrations
      .update({
        appId,
        integrationId,
        props: {
          brandColor: body.brandColor,
          // Set originWhitelist to undefined if array is empty
          originWhitelist: body.whitelistedUrls && body.whitelistedUrls.length === 0
            ? null
            : body.whitelistedUrls,
          businessName: body.businessName,
          businessIconUrl: body.businessIconUrl,
          fixedIntroPane: body.fixedIntroPane,
          conversationColor: body.conversationColor,
          backgroundImageUrl: body.backgroundImageUrl,
          prechatCapture: { enabled: true, fields: defaultPrechatCapture },
          actionColor: body.actionColor,
          displayStyle: body.displayStyle,
          buttonWidth: body.buttonWidth,
          buttonHeight: body.buttonHeight,
          buttonIconUrl: body.buttonIconUrl,
        },
      });

    smoochIntegration = integration;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to upadate a web integration';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const {
    name,
    description,
    contactPoint,
    clientDisconnectMinutes,
  } = body;
  let updateExpression = '';
  const expressionAttribute = {};
  const expressionAttributeNames = {};
  if (name) {
    updateExpression += 'set #name = :n';
    expressionAttribute[':n'] = name;
    expressionAttributeNames['#name'] = 'name';
  }
  if (description) {
    if (name) updateExpression += ',';
    updateExpression += 'description = :d';
    expressionAttribute[':d'] = description;
  }
  if (contactPoint) {
    if (name || description) updateExpression += ',';
    updateExpression += '#contactPoint = :c';
    expressionAttribute[':c'] = contactPoint;
    expressionAttributeNames['#contactPoint'] = 'contact-point';
  }
  if (clientDisconnectMinutes !== undefined) {
    if (name || description || contactPoint) updateExpression += ',';
    updateExpression += '#clientDisconnectMinutes = :cdm';
    expressionAttribute[':cdm'] = clientDisconnectMinutes;
    expressionAttributeNames['#clientDisconnectMinutes'] = 'client-disconnect-minutes';
  }

  let dynamoValue = {};

  if (body.name || body.description || body.contactPoint) {
    const updateParams = {
      TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
      Key: {
        'tenant-id': tenantId,
        id: integrationId,
      },
      ExpressionAttributeNames: expressionAttributeNames,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttribute,
      ReturnValues: 'ALL_NEW',
    };
    try {
      dynamoValue = await docClient.update(updateParams).promise();
      dynamoValue = dynamoValue.Attributes;
    } catch (error) {
      const errMsg = 'An Error has occurred trying to save a record in DynamoDB';

      log.error(errMsg, logContext, error);

      return {
        status: 500,
        body: { message: errMsg },
      };
    }
  }

  if (smoochIntegration.brandColor) {
    smoochIntegration.brandColor = `#${smoochIntegration.brandColor}`;
  }
  if (smoochIntegration.conversationColor) {
    smoochIntegration.conversationColor = `#${smoochIntegration.conversationColor}`;
  }
  if (smoochIntegration.actionColor) {
    smoochIntegration.actionColor = `#${smoochIntegration.actionColor}`;
  }

  const dynamoValueCased = {};

  delete smoochIntegration.integrationOrder;
  delete smoochIntegration._id;
  delete smoochIntegration.displayName;
  delete smoochIntegration.status;
  delete smoochIntegration.type;
  smoochIntegration.whitelistedUrls = smoochIntegration.originWhitelist;
  delete smoochIntegration.originWhitelist;
  smoochIntegration.prechatCapture = smoochIntegration.prechatCapture.fields[0].name;
  Object.keys(dynamoValue).forEach((v) => {
    dynamoValueCased[string.kebabCaseToCamelCase(v)] = dynamoValue[v];
  });
  delete dynamoValueCased.type;

  const result = {
    ...smoochIntegration,
    ...dynamoValueCased,
  };

  log.info('user updated a smooch integration', {
    userId: identity['user-id'],
    tenantId,
    smoochIntegrationId: integrationId,
    auditData: Object.keys(body),
    audit: true,
  });
  log.info('update-smooch-web-integration complete', { ...logContext, result });

  return {
    status: 201,
    body: { result },
  };
};

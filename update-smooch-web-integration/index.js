/**
 * Lambda that updates an smooch integration
 * */

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const SmoochCore = require('smooch-core');
const log = require('serenova-js-utils/lambda/log');
const string = require('serenova-js-utils/strings');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const bodySchema = Joi.object({
  name: Joi.string(),

  prechatCapture: Joi.string()
    .required()
    .valid('name', 'email'),

  contactPoint: Joi.string(),

  description: Joi.string().allow(''),

  brandColor: Joi.string(),

  originWhiteList: Joi.array()
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

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT } = process.env;
  const { body, params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'], smoochIntegrationId: params.id };

  log.info('update-smooch-web-integration was called', { ...logContext, params });

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
      SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`,
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
      const errMsg = 'An Error has occurred trying to fetch an app';

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
  } else if (body.prechatCapture === 'email') {
    defaultPrechatCapture = [{
      type: 'email',
      name: 'email',
      label: 'Email',
      placeholder: '',
      minSize: 1,
      maxSize: 128,
    }];
  } else {
    const errMsg = 'Bad request: body.prechatCapture invalid value';

    log.warn(errMsg, logContext);

    return {
      status: 400,
      body: { message: errMsg },
    };
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
          originWhiteList: body.originWhiteList,
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

  let updateExpression = '';
  const expressionAttribute = {};
  const expressionAttributeNames = {};
  if (body.name) {
    updateExpression += 'set #name = :n';
    expressionAttribute[':n'] = body.name;
    expressionAttributeNames['#name'] = 'name';
  }
  if (body.description) {
    if (body.name) updateExpression += ',';
    updateExpression += 'description = :d';
    expressionAttribute[':d'] = body.description;
  }
  if (body.contactPoint) {
    if (body.name || body.description) updateExpression += ',';
    updateExpression += '#contactPoint = :c';
    expressionAttribute[':c'] = body.contactPoint;
    expressionAttributeNames['#contactPoint'] = 'contact-point';
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

  const dynamoValueCased = {};

  delete smoochIntegration.integrationOrder;
  delete smoochIntegration._id;
  delete smoochIntegration.displayName;
  delete smoochIntegration.status;
  delete smoochIntegration.type;
  smoochIntegration.prechatCapture = smoochIntegration.prechatCapture.fields[0].name;
  Object.keys(dynamoValue).forEach((v) => {
    dynamoValueCased[string.kebabCaseToCamelCase(v)] = dynamoValue[v];
  });
  delete dynamoValueCased.type;

  const result = {
    ...smoochIntegration,
    ...dynamoValueCased,
  };

  log.info('update-smooch-web-integration complete', { ...logContext, result });

  return {
    status: 201,
    body: { result },
  };
};

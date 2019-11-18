/**
 * Lambda that updates an smooch integration
 * */

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const axios = require('axios');
const log = require('serenova-js-utils/lambda/log');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const bodySchema = Joi.object({
  name: Joi.string(),

  contactPoint: Joi.string(),

  description: Joi.string(),

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

  const appKeys = JSON.parse(appSecrets.SecretString);
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

  const smoochApiUrl = `https://api.smooch.io/v1.1/apps/${appId}/integrations/${integrationId}`;
  let integration;

  logContext.smoochAppId = appId;
  try {
    const res = await axios.put(smoochApiUrl, {
      brandColor: body.brandColor,
      originWhiteList: body.originWhiteList,
      businessName: body.businessName,
      businessIconUrl: body.businessIconUrl,
      fixedIntroPane: body.fixedIntroPane,
      conversationColor: body.conversationColor,
      backgroundImageUrl: body.backgroundImageUrl,
      actionColor: body.actionColor,
      displayStyle: body.displayStyle,
      buttonWidth: body.buttonWidth,
      buttonHeight: body.buttonHeight,
      buttonIconUrl: body.buttonIconUrl,
    },
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${appKeys[`${appId}-id`]}:${appKeys[`${appId}-secret`]}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });
    integration = res.data.integration;
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

  log.info('update-smooch-web-integration complete', logContext);

  return {
    status: 201,
    body: {
      ...integration,
      ...dynamoValue,
    },
  };
};

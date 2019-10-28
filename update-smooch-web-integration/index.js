/**
 * Lambda that updates an smooch integration
 * */

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const axios = require('axios');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const bodySchema = Joi.object({
  name: Joi.string(),

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
  console.log('update-smooch-web-integration', JSON.stringify(event));
  console.log('update-smooch-web-integration', JSON.stringify(process.env));

  const { AWS_REGION, ENVIRONMENT } = process.env;
  const { body, params } = event;
  try {
    await bodySchema.validateAsync(body);
  } catch (error) {
    console.warn(`Error: invalid body value ${error.details[0].message}`);

    return {
      status: 400,
      body: { message: `Error: invalid body value ${error.details[0].message}` },
    };
  }

  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    console.warn(`Error: invalid params value ${error.details[0].message}`);

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
    console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return {
      status: 500,
      body: { message: 'An Error has occurred trying to retrieve digital channels credentials' },
    };
  }

  const appKeys = JSON.parse(appSecrets.SecretString);
  const { 'tenant-id': tenantId, id: integrationId } = params;
  const queryParams = {
    Key: {
      'tenant-id': {
        tenantId,
      },
      id: {
        integrationId,
      },
    },
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
  };
  let appId;

  try {
    const queryResponse = await docClient.get(queryParams).promise();
    if (queryResponse.Item) {
      appId = queryResponse.Item['app-id'];
    } else {
      console.error(`An Error has occurred trying to fetch an app for tenant ${tenantId} and integrationId ${integrationId}`);

      return {
        status: 400,
        body: { message: `Unable to fetch integration for tenant ${tenantId} and integrationId ${integrationId}`, deleted: false },
      };
    }
  } catch (error) {
    console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return {
      status: 500,
      body: { message: `An Error has occurred trying to fetch an app in DynamoDB for tenant ${tenantId} and integrationId ${integrationId}`, deleted: false, error },
    };
  }

  const smoochApiUrl = `https://api.smooch.io/v1.1/apps/${appId}/integrations`;
  let integration;
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
        Authorization: `Basic ${Buffer.from(`${appKeys[`${tenantId}-id`]}:${appKeys[`${tenantId}-secret`]}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });
    integration = res.data;
  } catch (error) {
    console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return {
      status: 500,
      body: { message: `An Error has occurred trying to create a web integration for tenant ${tenantId}`, error },
    };
  }

  let updateExpression = '';
  const expressionAttribute = {};
  if (body.name) {
    updateExpression += 'set name = :n';
    expressionAttribute[':n'] = body.name;
  }
  if (body.description) {
    if (body.name) updateExpression += ',';
    updateExpression += 'description = :d';
    expressionAttribute[':d'] = body.description;
  }

  let dynamoValue = {};

  if (body.name || body.description) {
    const updateParams = {
      TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
      Key: {
        'tenant-id': tenantId,
        id: integrationId,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttribute,
      ReturnValues: 'ALL_NEW',
    };
    try {
      dynamoValue = await docClient.update(updateParams).promise();
    } catch (error) {
      console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

      return {
        status: 500,
        body: { message: `An Error has occurred trying to save a record in DynamoDB for tenant ${tenantId}`, error },
      };
    }
  }

  return {
    status: 201,
    body: {
      ...integration,
      ...dynamoValue,
    },
  };
};

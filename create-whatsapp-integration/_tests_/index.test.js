const { ValidationError } = require('joi');
const {
  lambda: {
    api: { validateTenantPermissions },
  },
} = require('alonzo');

jest.mock('aws-sdk');
jest.mock('alonzo');

global.Date.prototype.toISOString = jest.fn(() => 'January 1 1970');

validateTenantPermissions.mockReturnValue(true);

const mockBody = {
  whatsappId: '5e31c81640a22c000f5d7f28',
  name: 'smooch',
  description: 'description',
  clientDisconnectMinutes: 150,
};

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
  body: mockBody,
};

const mockGetSecretValue = jest.fn().mockImplementation(() => ({
  promise: () => ({
    SecretString: JSON.stringify({
      '5e31c81640a22c000f5d7f27-id': 'id',
      '5e31c81640a22c000f5d7f27-secret': 'secret',
    }),
  }),
}));

const mockGet = jest.fn().mockImplementation(() => ({
  promise: () => ({
    Item: null,
  }),
}));

const mockQuery = jest.fn().mockImplementation(() => ({
  promise: () => ({
    Count: 1,
    Items: [
      {
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
        id: '5e31c81640a22c000f5d7f27',
      },
    ],
  }),
}));

const mockList = jest.fn().mockImplementation(() => ({
  integrations: [
    {
      _id: '5e31c81640a22c000f5d7f28',
      type: 'whatsapp',
    },
  ],
  hasMore: false,
  offset: 0,
}));

const mockSmoochCore = jest.fn(() => ({
  integrations: {
    list: mockList,
  },
}));

const mockUpdate = jest.fn().mockImplementation(() => ({
  promise: () => ({
    Attributes: {
      'app-id': '5e31c81640a22c000f5d7f27',
      id: '5e31c81640a22c000f5d7f28',
      name: 'smooch',
      description: 'description',
      'client-disconnect-minutes': 15,
      active: true,
    },
  }),
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest
    .fn()
    .mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      query: mockQuery,
      update: mockUpdate,
    })),
  },
}));

jest.mock('smooch-core', () => mockSmoochCore);

const { handler } = require('../index');

describe('create-whatsapp-integration', () => {
  describe('Everything is successful', () => {
    it('sends back status 200 if the code runs without error ', async () => {
      const result = await handler(event);
      expect(result).toEqual({
        body: {
          result: {
            active: true,
            appId: '5e31c81640a22c000f5d7f27',
            clientDisconnectMinutes: 15,
            description: 'description',
            id: '5e31c81640a22c000f5d7f28',
            name: 'smooch',
          },
        },
        status: 201,
      });
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        await handler(event);
      });
      it('passes in the correct arguments to validateTenantPermissions', async () => {
        expect(validateTenantPermissions.mock.calls).toEqual([
          [
            '66d83870-30df-4a3b-8801-59edff162034',
            { 'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0' },
            ['WHATSAPP_INTEGRATIONS_APP_UPDATE'],
          ],
          [
            '66d83870-30df-4a3b-8801-59edff162034',
            { 'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0' },
            ['WHATSAPP_INTEGRATIONS_APP_UPDATE'],
          ],
        ]);
      });
      it('passes in the correct arguments to secretClient.getSecretValue() to get digital channels credentials', async () => {
        expect(mockGetSecretValue.mock.calls[0]).toEqual(
          expect.arrayContaining([
            {
              SecretId: 'us-east-1-dev-smooch-app',
            },
          ]),
        );
      });
      it('passes in the correct arguments to docClient.get()', async () => {
        expect(mockGet.mock.calls[0]).toEqual([
          {
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            TableName: 'us-east-1-dev-smooch',
          },
        ]);
      });
      it('passes in the correct arguments to docClient.query()', async () => {
        expect(mockQuery.mock.calls[0]).toEqual(
          expect.arrayContaining([
            {
              ExpressionAttributeNames: {
                '#integrationType': 'type',
                '#tenantId': 'tenant-id',
              },
              ExpressionAttributeValues: {
                ':t': '66d83870-30df-4a3b-8801-59edff162034',
                ':type': 'app',
              },
              IndexName: 'tenant-id-type-index',
              KeyConditionExpression:
                '#tenantId = :t and #integrationType = :type',
              TableName: 'us-east-1-dev-smooch',
            },
          ]),
        );
      });
      it('passes in the correct arguments to SmoochCore', async () => {
        expect(mockSmoochCore.mock.calls[0]).toEqual(
          expect.arrayContaining([
            {
              keyId: 'id',
              scope: 'app',
              secret: 'secret',
              serviceUrl: 'mock-smooch-api-url',
            },
          ]),
        );
      });
      it('passes in the correct arguments to smooch.integrations.list()', async () => {
        expect(mockList.mock.calls[0]).toEqual([
          { appId: '5e31c81640a22c000f5d7f27', types: 'whatsapp' },
        ]);
      });
      it('passes in the correct arguments to docClient.update()', async () => {
        expect(mockUpdate.mock.calls[0]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#appId': 'app-id',
              '#cdm': 'client-disconnect-minutes',
              '#createdBy': 'created-by',
              '#name': 'name',
              '#type': 'type',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': true,
              ':appId': '5e31c81640a22c000f5d7f27',
              ':cdm': 150,
              ':created': 'January 1 1970',
              ':createdBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
              ':description': 'description',
              ':name': 'smooch',
              ':t': 'whatsapp',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set #type = :t, #appId = :appId, #name = :name,
  #active = :active, #createdBy = :createdBy, #updatedBy = :updatedBy,
  created = :created, updated = :updated, description = :description, #cdm = :cdm`,
          },
        ]);
      });
      it('passes in the correct arguments to docClient.update() when description is not provided', async () => {
        const mockEvent = {
          ...event,
          body: {
            whatsappId: '5e31c81640a22c000f5d7f28',
            name: 'smooch',
            clientDisconnectMinutes: 150,
          },
        };
        await handler(mockEvent);
        expect(mockUpdate.mock.calls[2]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#appId': 'app-id',
              '#cdm': 'client-disconnect-minutes',
              '#createdBy': 'created-by',
              '#name': 'name',
              '#type': 'type',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': true,
              ':appId': '5e31c81640a22c000f5d7f27',
              ':cdm': 150,
              ':created': 'January 1 1970',
              ':createdBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
              ':name': 'smooch',
              ':t': 'whatsapp',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set #type = :t, #appId = :appId, #name = :name,
  #active = :active, #createdBy = :createdBy, #updatedBy = :updatedBy,
  created = :created, updated = :updated, #cdm = :cdm`,
          },
        ]);
      });
      it('passes in the correct arguments to docClient.update() when clientDisconnectMinutes is not provided', async () => {
        const mockEvent = {
          ...event,
          body: {
            whatsappId: '5e31c81640a22c000f5d7f28',
            name: 'smooch',
            description: 'description',
          },
        };
        await handler(mockEvent);
        expect(mockUpdate.mock.calls[3]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#appId': 'app-id',
              '#createdBy': 'created-by',
              '#name': 'name',
              '#type': 'type',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': true,
              ':appId': '5e31c81640a22c000f5d7f27',
              ':created': 'January 1 1970',
              ':createdBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
              ':description': 'description',
              ':name': 'smooch',
              ':t': 'whatsapp',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set #type = :t, #appId = :appId, #name = :name,
  #active = :active, #createdBy = :createdBy, #updatedBy = :updatedBy,
  created = :created, updated = :updated, description = :description`,
          },
        ]);
      });
      it('passes in the correct arguments to docClient.update() when active is provided', async () => {
        const mockEvent = {
          ...event,
          body: {
            whatsappId: '5e31c81640a22c000f5d7f28',
            name: 'smooch',
            description: 'description',
            clientDisconnectMinutes: 150,
            active: false,
          },
        };
        await handler(mockEvent);
        expect(mockUpdate.mock.calls[4]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#appId': 'app-id',
              '#cdm': 'client-disconnect-minutes',
              '#createdBy': 'created-by',
              '#name': 'name',
              '#type': 'type',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': false,
              ':appId': '5e31c81640a22c000f5d7f27',
              ':cdm': 150,
              ':created': 'January 1 1970',
              ':createdBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
              ':description': 'description',
              ':name': 'smooch',
              ':t': 'whatsapp',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set #type = :t, #appId = :appId, #name = :name,
  #active = :active, #createdBy = :createdBy, #updatedBy = :updatedBy,
  created = :created, updated = :updated, description = :description, #cdm = :cdm`,
          },
        ]);
      });
      it('passes in the correct arguments to docClient.update() when clientDisconnectMinutes is set to null', async () => {
        const mockEvent = {
          ...event,
          body: {
            whatsappId: '5e31c81640a22c000f5d7f28',
            name: 'smooch',
            description: '',
            clientDisconnectMinutes: null,
          },
        };
        await handler(mockEvent);
        expect(mockUpdate.mock.calls[5]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#appId': 'app-id',
              '#cdm': 'client-disconnect-minutes',
              '#createdBy': 'created-by',
              '#name': 'name',
              '#type': 'type',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': true,
              ':appId': '5e31c81640a22c000f5d7f27',
              ':cdm': null,
              ':created': 'January 1 1970',
              ':createdBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
              ':description': '',
              ':name': 'smooch',
              ':t': 'whatsapp',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set #type = :t, #appId = :appId, #name = :name,
  #active = :active, #createdBy = :createdBy, #updatedBy = :updatedBy,
  created = :created, updated = :updated, description = :description, #cdm = :cdm`,
          },
        ]);
      });
    });
  });

  it('sends back status 400 when there are invalid params value', async () => {
    const mockEvent = {
      params: {
        'tenant-id': '',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toEqual({
      body: {
        error: new ValidationError('"tenant-id" is not allowed to be empty'),
        message:
          'Error: invalid params value(s). "tenant-id" is not allowed to be empty',
      },
      status: 400,
    });
  });

  it('sends back status 400 when there is an invalid body value', async () => {
    const mockEvent = {
      ...event,
      body: {
        whatsappId: '',
        name: 'smooch',
        description: '',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toEqual({
      body: {
        message:
          'Error: invalid body value(s). "whatsappId" is not allowed to be empty',
      },
      status: 400,
    });
  });

  it('sends back status 400 when there is an invalid boolean value for active in body', async () => {
    const mockEvent = {
      ...event,
      body: {
        whatsappId: '5e31c81640a22c000f5d7f28',
        name: 'something',
        description: 'something',
        clientDisconnectMinutes: 1440,
        active: null,
      },
    };
    const result = await handler(mockEvent);
    expect(result).toEqual({
      body: {
        message:
          'Error: invalid body value(s). "active" must be one of [true, false] / "active" must be a boolean',
      },
      status: 400,
    });
  });

  it('sends back status 400 when there is more than one invalid values in body', async () => {
    const mockEvent = {
      ...event,
      body: {
        whatsappId: '',
        name: ' ',
        description: 'something',
        clientDisconnectMinutes: 1441,
        active: null,
      },
    };
    const result = await handler(mockEvent);
    expect(result).toEqual({
      body: {
        message:
          'Error: invalid body value(s). "whatsappId" is not allowed to be empty / "name" is not allowed to be empty / "clientDisconnectMinutes" must be less than or equal to 1440 / "active" must be one of [true, false] / "active" must be a boolean',
      },
      status: 400,
    });
  });

  it('sends back status 403 when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        expectedPermissions: {
          tenant: ['WHATSAPP_INTEGRATIONS_APP_UPDATE'],
        },
        message: 'Error not enough permissions',
      },
      status: 403,
    });
  });

  it('sends back status 500 when there is an error retrieving digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message:
          'An Error has occurred trying to retrieve digital channels credentials',
      },
      status: 500,
    });
  });

  it('sends back status 400 when there exist already an app with provided whatsappId as key', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({
        Item: {
          'app-id': '5fa425ef26770c000c171f9b',
          type: 'whatsapp',
          'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
          id: '5e31c81640a22c000f5d7f28',
        },
      }),
    }));
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        whatsappId: '5e31c81640a22c000f5d7f28',
        message: 'A record already exists for this whatsappId in this tenant',
      },
      status: 400,
    });
  });

  it('sends back status 400 when provided whatsappId as key is invalid for this request', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({
        Item: {
          'app-id': '5fa425ef26770c000c171f9b',
          type: 'web',
          'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
          id: '5e31c81640a22c000f5d7f28',
        },
      }),
    }));
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        whatsappId: '5e31c81640a22c000f5d7f28',
        message:
          'Invalid body value, whatsappId provided is invalid for this request',
      },
      status: 400,
    });
  });

  it('sends back status 500 when there is an error fetching an item from dynamo', async () => {
    mockGet.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        getParams: {
          Key: {
            id: '5e31c81640a22c000f5d7f28',
            'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
          },
          TableName: 'us-east-1-dev-smooch',
        },
        message:
          'An Error has occurred trying to fetch an app with passed whatsappId in DynamoDB',
      },
      status: 500,
    });
  });

  it('sends back status 500 when there is an error validating digital channels credentials', async () => {
    mockSmoochCore.mockImplementationOnce(() => {
      throw new Error('SmoochCore');
    });
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message: 'An error occured trying to retrieve whatsapp integrations',
      },
      status: 500,
    });
  });

  it('sends back status 500 when there is a problem fetching apps in DynamoDB', async () => {
    mockQuery.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message: 'An Error has occurred trying to fetch apps in DynamoDB',
        queryParams: {
          ExpressionAttributeNames: {
            '#integrationType': 'type',
            '#tenantId': 'tenant-id',
          },
          ExpressionAttributeValues: {
            ':t': '66d83870-30df-4a3b-8801-59edff162034',
            ':type': 'app',
          },
          IndexName: 'tenant-id-type-index',
          KeyConditionExpression: '#tenantId = :t and #integrationType = :type',
          TableName: 'us-east-1-dev-smooch',
        },
      },
      status: 500,
    });
  });

  it('sends back status 400 when there is no app that matches provided whatsappId for the tenant', async () => {
    mockList.mockImplementationOnce(() => ({
      integrations: [
        {
          _id: '5e31c81640a22c000f5d7f2n',
          type: 'whatsapp',
        },
      ],
      hasMore: false,
      offset: 0,
    }));
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message:
          'The whatsappId provided in the request body does not exist in smooch for this tenant',
      },
      status: 400,
    });
  });

  it('sends back status 500 when there is an error retrieving integrations', async () => {
    mockList.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message: 'An error occured trying to retrieve whatsapp integrations',
      },
      status: 500,
    });
  });

  it('sends back status 500 when there is an error saving records in DynamoDB for tenant', async () => {
    mockUpdate.mockImplementationOnce(() => {
      throw new Error('Failed to update your record');
    });
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        error: new Error('Failed to update your record'),
        message:
          'An Error has occurred trying to save a record in DynamoDB for tenant',
      },
      status: 500,
    });
  });
});

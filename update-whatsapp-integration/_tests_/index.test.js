const { ValidationError } = require('@hapi/joi');
const {
  lambda: {
    api: { validateTenantPermissions },
  },
} = require('alonzo');

jest.mock('aws-sdk');
jest.mock('alonzo');

global.Date.prototype.toISOString = jest.fn(() => 'January 1 1970');

validateTenantPermissions.mockReturnValue(true);

beforeAll(() => {
  global.process.env = {
    AWS_REGION: 'us-east-1',
    ENVIRONMENT: 'dev',
    smooch_api_url: 'mock-smooch-api-url',
  };
});

const mockParams = {
  'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
  id: '5e31c81640a22c000f5d7f28',
  'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  'remote-addr': 'remote-address',
  auth: 'given-auth',
};

const mockBody = {
  name: 'smooch',
  description: 'description',
  clientDisconnectMinutes: 15,
  active: false,
};

const event = {
  params: mockParams,
  body: mockBody,
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

const mockGet = jest.fn().mockImplementation(() => ({
  promise: () => ({
    Item: {
      'app-id': '5e31c81640a22c000f5d7f27',
      type: 'whatsapp',
      'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      id: '5e31c81640a22c000f5d7f28',
    },
  }),
}));

const mockUpdate = jest.fn().mockImplementation(() => ({
  promise: () => ({
    Attributes: {
      'app-id': '5e31c81640a22c000f5d7f27',
      id: '5e31c81640a22c000f5d7f28',
      name: 'smooch',
      description: 'description',
      'client-disconnect-minutes': 15,
      active: false,
    },
  }),
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      update: mockUpdate,
    })),
  },
}));

const { handler } = require('../index');

describe('update-whatsapp-integration', () => {
  describe('Everything is successful', () => {
    it('sends back status 200 if the code runs without error ', async () => {
      const result = await handler(event);
      expect(result).toEqual({
        body: {
          result: {
            active: false,
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
      it('passes in the correct arguments to docClient.update()', async () => {
        expect(mockUpdate.mock.calls[0]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#cdm': 'client-disconnect-minutes',
              '#name': 'name',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': false,
              ':cdm': 15,
              ':description': 'description',
              ':name': 'smooch',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set
    #updatedBy = :updatedBy,
    updated = :updated, #name = :name, description = :description, #cdm = :cdm, #active = :active`,
          },
        ]);
      });
      it('passes in the correct arguments to docClient.update() when name is not provided', async () => {
        const mockEvent = {
          ...event,
          body: {
            description: 'description',
            clientDisconnectMinutes: 150,
            active: true,
          },
        };
        await handler(mockEvent);
        expect(mockUpdate.mock.calls[2]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#cdm': 'client-disconnect-minutes',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': true,
              ':cdm': 150,
              ':description': 'description',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set
    #updatedBy = :updatedBy,
    updated = :updated, description = :description, #cdm = :cdm, #active = :active`,
          },
        ]);
      });
      it('passes in the correct arguments to docClient.update() when description is not provided', async () => {
        const mockEvent = {
          ...event,
          body: {
            name: 'smooch',
            clientDisconnectMinutes: 150,
            active: false,
          },
        };
        await handler(mockEvent);
        expect(mockUpdate.mock.calls[3]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#cdm': 'client-disconnect-minutes',
              '#name': 'name',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': false,
              ':cdm': 150,
              ':name': 'smooch',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set
    #updatedBy = :updatedBy,
    updated = :updated, #name = :name, #cdm = :cdm, #active = :active`,
          },
        ]);
      });
      it('passes in the correct arguments to docClient.update() when clientDisconnectMinutes is not provided', async () => {
        const mockEvent = {
          ...event,
          body: {
            name: 'smooch',
            description: 'description',
            active: true,
          },
        };
        await handler(mockEvent);
        expect(mockUpdate.mock.calls[4]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#name': 'name',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': true,
              ':description': 'description',
              ':name': 'smooch',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set
    #updatedBy = :updatedBy,
    updated = :updated, #name = :name, description = :description, #active = :active`,
          },
        ]);
      });
      it('passes in the correct arguments to docClient.update() when active is not provided', async () => {
        const mockEvent = {
          ...event,
          body: {
            name: 'smooch',
            description: 'description',
            clientDisconnectMinutes: 15,
          },
        };
        await handler(mockEvent);
        expect(mockUpdate.mock.calls[5]).toEqual([
          {
            ExpressionAttributeNames: {
              '#cdm': 'client-disconnect-minutes',
              '#name': 'name',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':cdm': 15,
              ':description': 'description',
              ':name': 'smooch',
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set
    #updatedBy = :updatedBy,
    updated = :updated, #name = :name, description = :description, #cdm = :cdm`,
          },
        ]);
      });
      it('passes in the correct arguments to docClient.update() when only active is provided', async () => {
        const mockEvent = {
          ...event,
          body: {
            active: false,
          },
        };
        await handler(mockEvent);
        expect(mockUpdate.mock.calls[6]).toEqual([
          {
            ExpressionAttributeNames: {
              '#active': 'active',
              '#updatedBy': 'updated-by',
            },
            ExpressionAttributeValues: {
              ':active': false,
              ':updated': 'January 1 1970',
              ':updatedBy': '667802d8-2260-436c-958a-2ee0f71f73f0',
            },
            Key: {
              id: '5e31c81640a22c000f5d7f28',
              'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
            },
            ReturnValues: 'ALL_NEW',
            TableName: 'us-east-1-dev-smooch',
            UpdateExpression: `set
    #updatedBy = :updatedBy,
    updated = :updated, #active = :active`,
          },
        ]);
      });
    });
  });

  it('sends back status 400 when there are invalid params value', async () => {
    const mockEvent = {
      params: {
        id: '',
        'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      },
      identity: {
        'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toEqual({
      body: {
        error: new ValidationError('"id" is not allowed to be empty'),
        message:
          'Error: invalid params value(s). "id" is not allowed to be empty',
      },
      status: 400,
    });
  });

  it('sends back status 400 when there is an invalid body value', async () => {
    const mockEvent = {
      ...event,
      body: {
        name: 'something',
        description: 'something',
        clientDisconnectMinutes: 1441,
      },
    };
    const result = await handler(mockEvent);
    expect(result).toEqual({
      body: {
        message:
          'Error: invalid body value(s). "clientDisconnectMinutes" must be less than or equal to 1440',
      },
      status: 400,
    });
  });

  it('sends back status 400 when there is an invalid boolean value for active in body', async () => {
    const mockEvent = {
      ...event,
      body: {
        name: 'something',
        description: 'something',
        clientDisconnectMinutes: 1440,
        active: null,
      },
    };
    const result = await handler(mockEvent);
    expect(result).toEqual({
      body: {
        message: 'Error: invalid body value(s). "active" must be a boolean',
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

  it('sends back status 404 when there is not an app with provided appId as key', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({
        Item: null,
      }),
    }));
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message: 'The app does not exist for this tenant',
        whatsappId: '5e31c81640a22c000f5d7f28',
      },
      status: 404,
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
          'Invalid parameter value, whatsappId provided is invalid for this request',
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
          'An Error has occurred trying to fetch an app with passed id in DynamoDB',
      },
      status: 500,
    });
  });

  it('sends back status 400 when body does not contain proper data', async () => {
    const mockEvent = {
      ...event,
      body: {
        appId: '5e31c81640a22c000f5d7f27',
      },
    };
    const result = await handler(mockEvent);
    expect(result).toEqual({
      body: {
        message: 'Request body is empty or provided data does not match schema',
      },
      status: 400,
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

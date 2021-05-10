const { ValidationError } = require('joi');
const axios = require('axios');
const {
  lambda: {
    api: { validateTenantPermissions, validatePlatformPermissions },
  },
} = require('alonzo');

jest.mock('alonzo');
jest.mock('aws-sdk');
jest.mock('axios');

validateTenantPermissions.mockReturnValue(true);
validatePlatformPermissions.mockReturnValue(false);

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        '5fa425ef26770c000c171f9c-id': 'id',
        '5fa425ef26770c000c171f9c-secret': 'secret',
      }),
    }),
  }));

const event = {
  params: {
    'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
    id: '5e31c81640a22c000f5d7f28',
  },
  identity: {
    'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0',
  },
};

const mockGet = jest.fn().mockImplementation(() => ({
  promise: () => ({
    Item: {
      created: '2020-11-10T19:56:39.673Z',
      'client-disconnect-minutes': 5,
      'updated-by': 'b47027e0-1126-11ea-953d-9bdc6d6573af',
      'app-id': '5fa425ef26770c000c171f9c',
      name: 'My test facebook integration',
      'created-by': 'b47027e0-1126-11ea-953d-9bdc6d6573af',
      type: 'facebook',
      updated: '2020-11-10T19:56:39.673Z',
      description: 'This is a test',
      'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
      id: '5e31c81640a22c000f5d7f28',
    },
  }),
}));

axios.mockImplementation(() => Promise.resolve({
  status: 200,
  data: {
    integration: {
      id: 'integration-id',
      status: 'active',
      type: 'messenger',
      displayName: 'display-name',
      appId: 'facebook-app-id',
      pageName: 'facebook-page-name',
      pageId: 'facebook-page-id',
    },
  },
}));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({ getSecretValue: mockGetSecretValue })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({ get: mockGet })),
  },
}));

const { handler } = require('../index');

describe('get-facebook-integration', () => {
  describe('Everything is successful', () => {
    it('sends back status 200 if the code runs without error ', async () => {
      const result = await handler(event);
      expect(result).toEqual({
        body: {
          result: {
            appId: '5fa425ef26770c000c171f9c',
            clientDisconnectMinutes: 5,
            created: '2020-11-10T19:56:39.673Z',
            createdBy: 'b47027e0-1126-11ea-953d-9bdc6d6573af',
            description: 'This is a test',
            id: '5e31c81640a22c000f5d7f28',
            name: 'My test facebook integration',
            tenantId: '66d83870-30df-4a3b-8801-59edff162034',
            type: 'facebook',
            status: 'active',
            facebookAppId: 'facebook-app-id',
            facebookPageId: 'facebook-page-id',
            pageName: 'facebook-page-name',
            updated: '2020-11-10T19:56:39.673Z',
            updatedBy: 'b47027e0-1126-11ea-953d-9bdc6d6573af',
          },
        },
        status: 200,
      });
    });
    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });
      it('passes in the correct arguments to validateTenantPermissions', async () => {
        expect(validateTenantPermissions.mock.calls).toEqual(
          expect.arrayContaining([
            [
              '66d83870-30df-4a3b-8801-59edff162034',
              { 'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0' },
              ['FACEBOOK_INTEGRATIONS_APP_READ'],
            ],
          ]),
        );
      });
      it('passes in the correct arguments to validatePlatformPermissions', async () => {
        expect(validatePlatformPermissions.mock.calls).toEqual([
          [
            { 'user-id': '667802d8-2260-436c-958a-2ee0f71f73f0' },
            ['PLATFORM_VIEW_ALL'],
          ],
        ]);
      });
      it('passes in the correct arguments to docClient.get()', async () => {
        expect(mockGet.mock.calls).toEqual([
          [
            {
              Key: {
                id: '5e31c81640a22c000f5d7f28',
                'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
              },
              TableName: 'us-east-1-dev-smooch',
            },
          ],
        ]);
      });
      it('passes in the correct arguments to axios calls', async () => {
        expect(axios.mock.calls).toEqual(
          expect.arrayContaining([
            [
              {
                auth: {
                  password: 'secret', username: 'id',
                },
                method: 'get',
                url: 'https://mock-smooch-api-url/v2/apps/5fa425ef26770c000c171f9c/integrations/5e31c81640a22c000f5d7f28',
              }],
          ]),
        );
      });
    });
  });

  it('sends back status 403 when there are not enough permissions', async () => {
    validateTenantPermissions.mockReturnValueOnce(false);
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        expectedPermissions: {
          tenant: ['FACEBOOK_INTEGRATIONS_APP_READ'],
          platform: ['PLATFORM_VIEW_ALL'],
        },
        message: 'Error not enough permissions',
      },
      status: 403,
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
        error: new ValidationError(
          '"tenant-id" is not allowed to be empty. "id" is required',
        ),
        message:
          'Error: invalid params value(s). "tenant-id" is not allowed to be empty / "id" is required',
      },
      status: 400,
    });
  });

  it('sends back status 404 when the integration does not exit for tenant', async () => {
    mockGet.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toEqual({
      body: { message: 'The integration does not exist for this tenant' },
      status: 404,
    });
  });

  it('sends back status 400 when provided facebookId as key is invalid for this request', async () => {
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
        facebookId: '5e31c81640a22c000f5d7f28',
        message:
          'Invalid parameter value, facebookId provided is invalid for this request',
      },
      status: 400,
    });
  });

  it('sends back status 500 when there is an error fetching the app in DynamoDB', async () => {
    mockGet.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message: 'An Error has occurred trying to fetch an app in DynamoDB',
        queryParams: {
          Key: {
            id: '5e31c81640a22c000f5d7f28',
            'tenant-id': '66d83870-30df-4a3b-8801-59edff162034',
          },
          TableName: 'us-east-1-dev-smooch',
        },
      },
      status: 500,
    });
  });

  it('sends back status 500 when there is an error trying to retrieve digital channels credentials', async () => {
    mockGetSecretValue.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message: 'An Error has occurred trying to retrieve digital channels credentials',
      },
      status: 500,
    });
  });

  it('sends back status 500 when fails to parse credentials', async () => {
    jest.clearAllMocks();
    mockGetSecretValue.mockImplementationOnce(() => ({
      promise: () => ({}),
    }));
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        message: 'Failed to parse smooch credentials or credentials are empty',
      },
      status: 500,
    });
  });

  it('sends back status 500 when there is an error occurred getting interaction detail', async () => {
    axios.mockRejectedValueOnce(new Error());
    const result = await handler(event);
    expect(result).toEqual({
      body: {
        error: 'Unexpected error occurred getting interaction detail',
      },
      status: 500,
    });
  });
});
